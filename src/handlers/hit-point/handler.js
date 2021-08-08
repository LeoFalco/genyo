'use strict'

const chromium = require('chrome-aws-lambda')
const ms = require('ms')
const { URL } = require('url')
const { CaptchaResolver } = require('../../core/captcha-resolver')
const { delay } = require('../../core/delay')
const fetch = require('node-fetch')

const CAPTCHA_API_KEY = '6f22570623a8b7eb2158155f11f171a0'
const GENYO_URL = 'https://app.genyo.com.br?aba=registrarPonto'
const CAPTCHA_RESOLVER_URL = 'http://2captcha.com'

async function closeBrowser (browser) {
  if (browser) {
    await browser.close().catch()
  }
}

async function getDataFromNavigatorPage () {
  const browser = await chromium.puppeteer.launch({
    headless: true
  })
  console.log('browser created')

  try {
    const page = await browser.newPage()
    console.log('new page created')

    await page.goto(GENYO_URL, {
      waitUntil: 'load',
      timeout: ms('60s')
    })

    await delay(ms('1s'))
    console.log('navigated to genio url')

    const { captchaSrc, cookie } = await page.evaluate(() => {
      const iframe = document.querySelector('iframe')
      return {
        captchaSrc: iframe.src,
        cookie: document.cookie
      }
    })

    await closeBrowser(browser)

    const capchaUrl = new URL(captchaSrc)
    const googleKey = capchaUrl.searchParams.get('k')

    return {
      googleKey,
      cookie
    }
  } catch (err) {
    await closeBrowser(browser)
    throw err
  }
}

async function handler () {
  const browser = null

  try {
    const { googleKey, cookie } = await getDataFromNavigatorPage()
    console.log('googleKey', googleKey)
    console.log('cookie', cookie)

    const capchaResponseToken = await new CaptchaResolver({
      apiKey: CAPTCHA_API_KEY,
      baseURL: CAPTCHA_RESOLVER_URL
    }).resolveCapcha({
      googleKey: googleKey,
      pageurl: GENYO_URL
    })

    console.log('capchaResponseToken', capchaResponseToken)

    const pointType = process.env.POINT_TYPE

    const reponseHeaders = await fetch('https://app.genyo.com.br/registrarPonto', {
      method: 'POST',
      referrer: 'https://app.genyo.com.br/?aba=abaColaborador',
      referrerPolicy: 'strict-origin-when-cross-origin',
      body: `codigoEmpresa=2WRBK&numeroAcesso=629268&foto=&observacao=&g-recaptcha-response=${capchaResponseToken}&${pointType}=1`,
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
        cookie: cookie
      }
    }).then(response => response.headers)

    console.log('reponseHeaders', reponseHeaders)

    return {
      code: 'ok'
    }
  } catch (err) {
    console.log('err', err)
    if (browser) {
      await browser.close()
    }

    return {
      code: 'err',
      err: {
        message: err.message,
        stack: err.stack
      }
    }
  }
};

module.exports = {
  handler
}
