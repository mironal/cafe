const HTTP = require("http");
const HTTPS = require("https");

/**
 *
 * @param {string} url
 * @returns {Promise<HTTP.IncomingMessage>}
 */
async function downloadHtml(url) {
  const http = url.startsWith("https:") ? HTTPS : HTTP;
  return new Promise((resolve, reject) => {
    http.get(url, response => {
      if (response.statusCode !== 200) {
        const error = new Error(
          `Error ${response.statusCode}: ${response.statusMessage}`
        );
        reject(error);
        return;
      }
      resolve(response);
    });
  });
}

module.exports = downloadHtml;
