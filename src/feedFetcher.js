require("dotenv").config();
const Parser = require('rss-parser');
const cheerio = require("cheerio");

const parser = new Parser();

parser.parseURL(process.env.REDDIT_SAVED_RSS_FEED)
  .then((feed) => {
    feed.items.forEach((item) => {
      console.log("---");
      console.log(`title: ${item.title}`);
      console.log(`link: ${item.link}`);
      console.log(`content: ${item.content}`);
      console.log("---");

      const $ = cheerio.load(item.content);
      const hrefs = $("a").map((index, element) => ("href" in element.attribs) ? element.attribs.href : null)
        .get()
        .filter((element) => element != null);
      console.log(hrefs);
    })
  })
  .catch((error) => console.error(`${error}`));