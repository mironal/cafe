const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

function makeCacheFilePath(basePath, country, year, fileName) {
  return path.join(basePath, ".cache", country, year, fileName);
}

/**
 *
 * @param {string} country
 * @param {string} year
 * @param {string} basePath
 */
function exists(country, year, basePath) {
  return fs.existsSync(
    makeCacheFilePath(basePath, country, year, "index.html")
  );
}

/**
 *
 * @param {string} country
 * @param {string} year
 * @param {string} basePath
 */
function createCacheWritableStream(country, year, basePath) {
  const p = makeCacheFilePath(basePath, country, year, "index.html");

  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return fs.createWriteStream(p, "utf8");
}

async function readCache(country, year, basePath) {
  const p = makeCacheFilePath(basePath, country, year, "index.html");
  return promisify(fs.readFile)(p, "utf8");
}

module.exports = {
  exists,
  createCacheWritableStream,
  readCache,
};
