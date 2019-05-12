const puppeteer = require("puppeteer-core");
const fs = require("fs");
const pLimit = require("p-limit");
const path = require("path");
const { exists, createCacheWritableStream, readCache } = require("./cache");
const downloadHtml = require("./download");
const sortBy = require("lodash.sortby");
const readline = require("readline");

const executablePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const coeUrl = "https://allianceforcoffeeexcellence.org/cup-of-excellence/";

const baseDir = path.join(__dirname, "../");
const OUTPUT_FILE = path.join(baseDir, "coe_ranking.json");

async function proceed() {
  return new Promise(resolve => {
    if (fs.existsSync(OUTPUT_FILE)) {
      const msg = `${OUTPUT_FILE} found, Overwrite it? (y/n)`;
      const rl = readline.createInterface(process.stdin, process.stdout);
      rl.question(`${msg}\n`, ans => {
        rl.close();
        if (ans === "y") {
          resolve(true);
          return;
        }
        resolve(false);
      });
    } else {
      resolve(true);
    }
  });
}

/**
 * @template T
 * @param {T[]} arr
 * @param {(value: T) => boolean} callback
 * @returns {T[]}
 */
async function aFilter(arr, callback) {
  const fail = Symbol();
  return (await Promise.all(
    arr.map(async item => ((await callback(item)) ? item : fail))
  )).filter(i => i !== fail);
}

/**
 *
 * @param {puppeteer.Page} page
 */
async function getRanking(page) {
  const table = await page.$("table.table.table-bordered");

  const tableData = await Promise.all(
    (await table.$$("tr")).map(tr =>
      tr.$$eval("td, th", tds => tds.map(td => td.textContent))
    )
  );

  const [title, ...datas] = tableData;

  const list = datas.map(d =>
    title.reduce((prev, current, index) => {
      prev[current.toLowerCase()] = d[index];
      return prev;
    }, {})
  );

  return list;
}

async function retrieveHistories(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  await page.goto(coeUrl, { waitUntil: "networkidle2" });

  const countryList = await aFilter(
    await page.$$("ul#menu-coe-country-programs-menu > li"),
    async l => !!(await l.$(".sub-menu"))
  );

  /**
   * @type {{country: string, year: string, url: string}[]}
   */
  const configs = [];

  for (const country of countryList) {
    const countryName = (await country.$eval("a", a => a.textContent)).trim();

    const yearUrls = await country.$$eval(".sub-menu > li > a", ls =>
      ls.map(l => ({ year: l.textContent, href: l.href }))
    );

    for (const yl of yearUrls) {
      configs.push({
        country: countryName,
        ...yl,
      });
    }
  }

  await page.close();

  return configs;
}

/**
 * @param config {{country: string, year: string, url: string}}
 */
async function downloadIfNeeded(config) {
  const { country, year, href } = config;

  if (exists(country, year, __dirname)) {
    console.log("Cache found for", JSON.stringify(config));
    return;
  }

  console.log("Cache not found. Download", JSON.stringify(config));

  const response = await downloadHtml(href);

  const output = createCacheWritableStream(country, year, __dirname);
  response.pipe(output);

  await new Promise((resolve, reject) => {
    response.once("end", resolve);
    response.once("error", reject);
  });
}

(async () => {
  if (!(await proceed())) {
    console.log("Bye");
    return;
  }

  const browser = await puppeteer.launch({ executablePath });

  console.log("> Retrive COE histories...");
  const histories = await retrieveHistories(browser);
  console.log(`> ${histories.length} histories found.`);

  const dlLimit = pLimit(1)

  await Promise.all(histories.map(hist =>
      dlLimit(() => downloadIfNeeded(hist))
    ));

  const limit = pLimit(10);
  const rankings = await Promise.all(
    histories.map(hist => {
      const task = async () => {
        console.log("> Get ranking", JSON.stringify(hist));
        const page = await browser.newPage();
        const html = await readCache(hist.country, hist.year, __dirname);

        await page.setContent(html);

        const ranking = await getRanking(page);

        console.log(hist, ranking);
        await page.close();
        return {
          ...hist,
          ranking,
        };
      };
      return limit(task);
    })
  );

  const sorted = sortBy(rankings, ["country", "year"]);
  console.log("Write to", OUTPUT_FILE);
  const wStream = fs.createWriteStream(OUTPUT_FILE, "utf8");

  wStream.write("[\n");
  sorted.forEach((item, i) => {
    if (i !== 0) {
      wStream.write(",\n");
    }
    wStream.write(JSON.stringify(item));
  });
  wStream.write("\n]");
  wStream.close();

  await browser.close();
})();
