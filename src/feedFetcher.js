require("dotenv").config();
const Parser = require('rss-parser');
const cheerio = require("cheerio");
const rp = require("request-promise-native");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const parse = require('url-parse');
const path = require("path");
const mkdirp = require("mkdirp");
const http = require("http");
const PromiseBar = require("promise.bar");
PromiseBar.enable();

const agent = new http.Agent({maxSockets: process.env.CONNECTIONS, keepAlive: true});
const parser = new Parser({item: ["title"]});

/**
 * Retrieves reddit feed and converts each entry into a length 4 array of poster, subreddit, link, comments, and title.
 * 
 * @param {Parser.feed} feed Parser feed object.
 */
const getHrefsFromFeed = (feed) => {
  return feed.items.map((item) => {
    if (process.env.ENABLE_LOG_SUMMARY === "true") {
      console.log("---");
      console.log(`title: ${item.title}`);
      console.log(`link: ${item.link}`);
      console.log(`content: ${item.content}`);
      console.log("---");
    }

    const $ = cheerio.load(item.content);
    const links = $("a").map((index, element) => ("href" in element.attribs) ? element.attribs.href : null)
      .get()
      .filter((element) => element != null);
    // Reddit title is more reliable than imgur titles (may be null)
    links.push(item.title.replace("/", "-").trim());
    return links;
  });
}

/**
 * Converts an array of arrays of links to an array of objects.
 * 
 * @param {Array<Array<String>>} hrefsArr Array of length 5 array of links to reddit. The elements should be arranged in order
 *                               of poster, subreddit, link, comments, and title.
 */
const convertHrefsToObjects = (hrefsArr) => {
  const positionKeys = ["poster", "subreddit", "link", "comments", "title"];
  return hrefsArr.filter((hrefs) => hrefs && hrefs.length === positionKeys.length)
    .map((hrefs) => hrefs.reduce((prev, curr, index) => Object.assign(prev, {[positionKeys[index]]: curr}), {}));
}

/**
 * Filter out objects who do not link to imgur or link to imgur but are single images.
 * 
 * @param {Array<Object>} hrefObjs Array of Objects with keys: poster, subreddit, link, comments, and title.
 */
const getImgurPosts = (hrefObjs) => {
  return hrefObjs.filter((hrefObj) => {
    const parsedLink = parse(hrefObj.link, true);
    return parsedLink.hostname.endsWith("imgur.com") && !(parsedLink.pathname.endsWith(".jpg") || parsedLink.pathname.endsWith(".png"));
  });
}

/**
 * Extend the hrefObjs by parsing out subreddit name and imgur album hash.
 * 
 * @param {Array<Object>} hrefObjs Array of Objects with keys: poster, subreddit, link, comments, and title.
 */
const extendMetaData = (hrefObjs) => {
  return hrefObjs.map((hrefObj) => {
    let subreddit = hrefObj.subreddit;
    if (subreddit.endsWith("/")) {
      subreddit = subreddit.substring(0, subreddit.length - 1);
    }
    const subredditSource = subreddit.substring(subreddit.lastIndexOf("/") + 1, subreddit.length);

    let imgurLink = hrefObj.link;
    if (imgurLink.endsWith("/")) {
      imgurLink = imgurLink.subreddit(0, imgurLink.length - 1);
    }
    const imgurHash = imgurLink.substring(imgurLink.lastIndexOf("/") + 1, imgurLink.length);
    return Object.assign(hrefObj, {subredditSource, imgurHash});
  });
}

/**
 * Download Images from Imgur Album.
 * 
 * @param {Array<Object>} extendObjs Array of Objects with keys: poster, subreddit, link, comments, title, subredditSource, and imgurHash.
 */
const downloadImages = (extendObjs) => {
  return Promise.all(extendObjs.map((extendObj) => {
    const destinationBase = path.join(process.env.DESTINATION, extendObj.subredditSource, extendObj.title);
    if (!fs.existsSync(destinationBase)) {
      mkdirp.sync(destinationBase);
    }
    return downloadAlbum(extendObj.imgurHash, destinationBase);
  }));
}

/**
 * Download an Album.
 * 
 * @param {String} imgurHash An imgur album hash.
 * @param {String} path where to store album images.
 */
const downloadAlbum = (imgurHash, destinationBase) => {
  const options = {
    uri: `https://api.imgur.com/3/album/${imgurHash}`,
    headers: {
      "Authorization": `Client-ID ${process.env.IMGUR_CLIENT_SECRET}`
    },
    json: true,
    pool: agent
  };
  return rp(options)
    .then((response) => {
      if ("data" in response && "images" in response.data) {
        return response.data.images.map((image) => { return {link: image.link, type: image.type} });
      } else {
        return [];
      }
    })
    .then((links) => {
      return PromiseBar.all(links.map((link, pageNum) => {
        const options = {
          uri: link.link,
          encoding: null,
          headers: {
            "Content-type": link.type
          },
          pool: agent
        };
        const filetype = link.type.substring(link.type.lastIndexOf("/") + 1, link.type.length);
        const filename = (pageNum <= 9) ? `page_0${pageNum}.${filetype}` : `page_${pageNum}.${filetype}`;
        const filepath =  path.join(destinationBase, filename);

        if (fs.existsSync(filepath)) {
          return Promise.resolve(filepath);
        } else {
        }

        return rp(options)
          .then((response) => {
            const buffer = Buffer.from(response);
            fs.writeFileSync(filepath, buffer);
            return filepath;
          })
          .catch((error) => {
            console.error("---");
            console.error(`error fetching page ${pageNum} for ${path.basename(destinationBase)}`);
            console.error(error);
            console.error(link);
            console.error("---");
          });
      }), {label: path.basename(destinationBase)});
    })
    .then((filePaths) => {
      if (filePaths.length < 1) {
        return;
      }

      const title = path.basename(path.dirname(filePaths[0]));
      const filepath = path.join(destinationBase, `${title}.pdf`);
      if (fs.existsSync(filepath)) {
        return;
      }

      const doc = new PDFDocument({autoFirstPage: false});
      doc.pipe(fs.createWriteStream(filepath)); 
      let image = doc.openImage(filePaths[0]);
      doc.addPage({size: [image.width, image.height]});
      doc.image(image, 0, 0);
      for (let i = 1; i < filePaths.length; i++) {
        image = doc.openImage(filePaths[i]);
        doc.addPage({size: [image.width, image.height]});
        doc.image(filePaths[i], 0, 0);
      }
      
      doc.end();
    })
    .catch(console.error);
}

parser.parseURL(process.env.REDDIT_SAVED_RSS_FEED)
  .then(getHrefsFromFeed)
  .then(convertHrefsToObjects)
  .then(getImgurPosts)
  .then(extendMetaData)
  .then(downloadImages)
  .catch(console.error);
