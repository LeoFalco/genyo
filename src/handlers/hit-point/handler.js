'use strict'

const chromium = require('chrome-aws-lambda')
const ms = require('ms')
const { URL } = require('url')
const { CaptchaResolver } = require('../../core/captcha-resolver')
const { delay } = require('../../core/delay')
const fetch = require('node-fetch')
const { format, differenceInMinutes, setMinutes, setHours, closestIndexTo } = require('date-fns')

const CAPTCHA_API_KEY = '6f22570623a8b7eb2158155f11f171a0'
const GENYO_URL = 'https://app.genyo.com.br?aba=registrarPonto'
const CAPTCHA_RESOLVER_URL = 'http://2captcha.com'
const fs = require('fs')

const DomParser = require('dom-parser')
const { utcToZonedTime } = require('date-fns-tz')

async function closeBrowser (browser) {
  if (browser) {
    await browser.close().catch()
  }
}

async function createBrowser () {
  return chromium.puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath,
    headless: true
  })
}

async function getDataFromNavigatorPage ({ browser }) {
  let googleKey = null
  let cookie = null

  try {
    const pages = await browser.pages()
    const page = pages[0] || await browser.newPage()
    console.log('new page created')

    await page.goto(GENYO_URL, {
      waitUntil: 'load',
      timeout: ms('60s')
    })

    await delay(ms('1s'))
    console.log('navigated to genio url')

    const result = await page.evaluate(() => {
      const iframe = document.querySelector('iframe')
      return {
        captchaSrc: iframe.src,
        cookie: document.cookie
      }
    })

    googleKey = new URL(result.captchaSrc).searchParams.get('k')
    cookie = result.cookie
  } catch (err) {
    console.log('error', err)
  } finally {
    closeBrowser(browser)
  }

  return {
    googleKey,
    cookie
  }
}

function getCurrentHour () {
  const now = utcToZonedTime(new Date(), 'America/Sao_Paulo')

  return {
    hour: now.getHours(),
    minute: now.getMinutes(),
    now
  }
}

async function getPointType ({ now }) {
  const dates = [
    { hour: 8, minute: 0, type: 'entrada' },
    { hour: 12, minute: 0, type: 'saida' },
    { hour: 13, minute: 30, type: 'entrada' },
    { hour: 15, minute: 30, type: 'saida' }
  ]

  const mappedDates = dates.map(date => {
    return setHours(setMinutes(now, date.minute), date.hour)
  })

  const closestIndex = closestIndexTo(now, mappedDates)

  const closestDate = dates[closestIndex]

  console.log('closestDate', closestDate)

  return closestDate.type
}

async function hitPointRequest ({ capchaResponseToken, pointType, cookie }) {
  await fetch('https://app.genyo.com.br/registrarPonto', {
    method: 'POST',
    referrer: 'https://app.genyo.com.br/?aba=abaColaborador',
    referrerPolicy: 'strict-origin-when-cross-origin',
    body: new URLSearchParams({
      codigoEmpresa: '2WRBK',
      numeroAcesso: '629268',
      foto: '',
      observacao: '',
      'g-recaptcha-response': capchaResponseToken,
      [pointType]: 1
    }),
    mode: 'cors',
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
      'accept-language': 'pt-BR,pt;q=0.9,es;q=0.8,en;q=0.7',
      'cache-control': 'no-cache',
      'content-type': 'application/x-www-form-urlencoded',
      pragma: 'no-cache',
      'sec-ch-ua': '"Chromium";v="92", " Not A;Brand";v="99", "Google Chrome";v="92"',
      'sec-ch-ua-mobile': '?0',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1',
      cookie: `${cookie}; 15635603234114962=j%3A%2261114490965fdd0b529a43a1%22`
    }
  })

  console.log('hit point request sent')
}
async function checkIfHitPointHasSuccessful ({ cookie, now, pointType }) {
  const nowFormatted = format(now, 'dd/MM/yyyy')

  const resultHtml = await fetch('https://app.genyo.com.br/c/historicoPontos', {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
      'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8,es;q=0.7',
      'cache-control': 'no-cache',
      'content-type': 'application/x-www-form-urlencoded',
      pragma: 'no-cache',
      'sec-ch-ua': '"Chromium";v="94", "Google Chrome";v="94", ";Not A Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Linux"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1',
      cookie: `${cookie}; 15635603234114962=j%3A%2261114490965fdd0b529a43a1%22`
    },
    referrer: 'https://app.genyo.com.br/c/historicoPontos',
    referrerPolicy: 'strict-origin-when-cross-origin',
    body: new URLSearchParams({
      dataInicio: nowFormatted,
      dataFim: nowFormatted
    }),
    method: 'POST',
    mode: 'cors',
    credentials: 'include'
  }).then(res => res.text())

  // const resultHtml = fs.readFileSync('./log.html', { encoding: 'utf-8' })

  const domParser = new DomParser()

  fs.writeFileSync('./log.html', resultHtml, { encoding: 'utf-8' })

  const document = domParser.parseFromString(resultHtml, {
    lowerCaseTags: true,
    lowerCaseAttributeNames: true,
    xmlMode: true
  })

  const todayId = format(now, 'ddMMyyyy')
  const todayElement = document.getElementById(todayId)

  if (!todayElement) {
    console.log('today element not found')
    return false
  }

  const [timeline] = todayElement.getElementsByClassName('timeline')

  if (!timeline) {
    console.log('timeline not found')
    return false
  }

  const timelineItems = Array.from(timeline.getElementsByTagName('li'))

  const dates = timelineItems.map(item => {
    const [timestampElement] = item.getElementsByClassName('timestamp')
    const [dateElement] = timestampElement.getElementsByClassName('date')
    const timeFormatted = dateElement.textContent.trim()
    const [hour, minute] = timeFormatted.split(':').map(time => parseInt(time))

    const date = setHours(setMinutes(now, minute), hour)

    return {
      timeFormatted,
      date,
      hour,
      minute,
      type: item.getAttribute('id').toLowerCase()
    }
  })

  const closestIndex = closestIndexTo(now, dates.map(date => date.date))
  const closestDate = dates[closestIndex]

  console.log('items', dates)
  console.log('closestDate', closestDate)

  if (closestDate) {
    if (closestDate.type === pointType) {
      const diference = differenceInMinutes(now, closestDate.date)

      if (diference <= 5) {
        console.log('hit point has successful')
        return true
      }
    }
  }

  console.warn('hit point has not successful, please check genio web interface')
  return false
}

async function handler () {
  const browser = await createBrowser()
  const { googleKey, cookie } = await getDataFromNavigatorPage({
    browser
  })

  console.log('googleKey', googleKey)
  console.log('cookie', cookie)

  if (!googleKey || !cookie) {
    return {
      code: 'error'
    }
  }

  const capchaResolver = new CaptchaResolver({
    apiKey: CAPTCHA_API_KEY,
    baseURL: CAPTCHA_RESOLVER_URL
  })

  const capchaResponseToken = await capchaResolver.resolveCapcha({
    googleKey: googleKey,
    pageurl: GENYO_URL
  })

  console.log('capchaResponseToken', capchaResponseToken)
  const { now } = getCurrentHour()

  console.log('now', format(now, 'dd/MM/yyyy hh:mm z'))

  const pointType = await getPointType({ now })

  console.log('pointType', pointType)

  await hitPointRequest({
    pointType: pointType,
    capchaResponseToken: capchaResponseToken,
    cookie: cookie
  })

  await checkIfHitPointHasSuccessful({
    cookie,
    pointType,
    now
  })

  return {
    code: 'ok'
  }
};

module.exports = {
  handler
}
