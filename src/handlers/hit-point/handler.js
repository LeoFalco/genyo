'use strict'

const ms = require('ms')
const chromium = require('chrome-aws-lambda')
const fetch = require('node-fetch')
const notifier = require('node-notifier')
const { delay } = require('../../core/delay')
const { format, setMinutes, setHours, closestIndexTo } = require('date-fns')
const { utcToZonedTime } = require('date-fns-tz')
const { URL } = require('url')
const { CaptchaResolver } = require('../../core/captcha-resolver')

const CAPTCHA_API_KEY = '6f22570623a8b7eb2158155f11f171a0'
const GENYO_URL = 'https://app.genyo.com.br?aba=registrarPonto'
const CAPTCHA_RESOLVER_URL = 'http://2captcha.com'

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
    { hour: 17, minute: 30, type: 'saida' }
  ]

  const mappedDates = dates.map(date => {
    return setHours(setMinutes(now, date.minute), date.hour)
  })

  const closestIndex = closestIndexTo(now, mappedDates)

  const closestDate = dates[closestIndex]

  console.log('closestDate', closestDate)

  return closestDate.type
}

async function hitPointRequest ({ capchaResponse, pointType, cookie }) {
  await fetch('https://app.genyo.com.br/registrarPonto', {
    method: 'POST',
    referrer: 'https://app.genyo.com.br/?aba=abaColaborador',
    referrerPolicy: 'strict-origin-when-cross-origin',
    body: new URLSearchParams({
      codigoEmpresa: '2WRBK',
      numeroAcesso: '629268',
      foto: '',
      observacao: '',
      'g-recaptcha-response': capchaResponse,
      [pointType]: 1
    }),
    mode: 'cors',
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml',
      'content-type': 'application/x-www-form-urlencoded',
      pragma: 'no-cache',
      cookie: `${cookie}; 15635603234114962=j%3A%2261114490965fdd0b529a43a1%22`
    }
  })

  console.log('hit point request sent')
}

async function handler () {
  console.log(new Date().toLocaleString())

  const timeToSleep = ms('4m') * Math.random()

  console.log('timeToSleep', timeToSleep / 1000, 'seconds')

  await delay(timeToSleep)

  console.log('timeToSleep finished', new Date().toLocaleString())

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

  const { capchaResponse, balance } = await capchaResolver.resolveCapcha({
    googleKey: googleKey,
    pageUrl: GENYO_URL
  })

  console.log('capchaResponse', capchaResponse)

  const { now } = getCurrentHour()
  const nowFormatted = format(now, 'dd/MM/yyyy hh:mm z')
  const pointType = await getPointType({ now })

  console.log('pointType', pointType)

  await hitPointRequest({
    pointType: pointType,
    capchaResponse: capchaResponse,
    cookie: cookie
  })

  notifier.notify({
    title: 'Genyo',
    message: `Ponto registrado com sucesso às: ${nowFormatted}, creditos restantes: ${balance}`
  })

  return {
    code: 'ok'
  }
};

module.exports = {
  handler
}
