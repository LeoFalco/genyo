'use strict'

const chromium = require('chrome-aws-lambda')
const { URL } = require('url')
const { CaptchaResolver } = require('../../core/captcha-resolver')
const { delay } = require('../../core/delay')

const CAPTCHA_API_KEY = '6f22570623a8b7eb2158155f11f171a0'
const GENYO_URL = 'https://app.genyo.com.br?aba=registrarPonto'
const CAPTCHA_RESOLVER_URL = 'http://2captcha.com'

async function handler () {
  let browser = null

  try {
    browser = await chromium.puppeteer.launch({
      headless: chromium.headless
    })

    const page = await browser.newPage()

    await page.goto(GENYO_URL)
    await delay(2000)

    const captchaSrc = await page.evaluate(() => {
      document.querySelector('#codigoEmpresa2').value = '2WRBK'
      document.querySelector('#numeroAcesso2').value = '629268'
      return document.querySelector('iframe').src
    })

    const url = new URL(captchaSrc)

    const googleKey = url.searchParams.get('k')
    const captchaResolver = new CaptchaResolver({
      apiKey: CAPTCHA_API_KEY,
      baseURL: CAPTCHA_RESOLVER_URL
    })

    const requestId = await captchaResolver.sendChallenge({
      googleKey: googleKey,
      pageurl: GENYO_URL
    })

    const capchaResponse = await captchaResolver.getChallengeResponse({
      requestId: requestId
    })

    console.log('process.env.POINT_TYPE', process.env.POINT_TYPE)

    await page.evaluate((capchaResponse, pointType) => {
      document.querySelector('iframe').click()

      const captchaResponseElement = document.querySelector('#g-recaptcha-response')

      captchaResponseElement.innerHTML = capchaResponse

      // console.log('captchaResponseElement', captchaResponseElement)

      // if (pointType === 'start') {
      //   document.querySelector('button[data-tipo=entrada').click()
      // }

      // if (pointType === 'stop') {
      //   document.querySelector('button[data-tipo=saida').click()
      // }
      // document.querySelector('button[data-acao=continuarPonto').click()
    }, capchaResponse, process.env.POINT_TYPE)

    await delay(1000000)

    await browser.close()

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
