'use strict'

const axios = require('axios')
const { delay } = require('./delay')

class CaptchaResolver {
  constructor ({ apiKey, baseURL }) {
    this.apiKey = apiKey
    this.client = axios.default.create({
      baseURL: baseURL
    })
  }

  async sendChallenge ({ pageurl, googleKey }) {
    const response = await this.client.post('in.php', null, {
      params: {
        key: this.apiKey,
        method: 'userrecaptcha',
        googlekey: googleKey,
        json: 1,
        pageurl: pageurl
      }
    })

    console.log('challenge sent', response.data)

    return response.data.request.toString()
  }

  async getChallengeResponse ({ requestId }) {
    while (true) {
      await delay(15000)

      const response = await this.client.post('res.php', null, {
        params: {
          key: this.apiKey,
          action: 'get',
          id: requestId,
          json: 1,
          header_acao: 1
        }
      })

      console.log('response', response.data)

      if (response.data.request.startsWith('ERROR')) {
        throw new Error(`capcha resolver service returned error ${response.data.request}`)
      }

      if (response.data.status === 1) {
        console.log('captcha solved')
        return response.data.request
      }
    }
  }
}

module.exports = {
  CaptchaResolver
}
