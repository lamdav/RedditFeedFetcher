# Reddit Feed Fetcher
Consume Reddit Feed and Download Imgur Albums

## Motive
I wanted some script/program that could listen in on my saved post and check if it was an imgur album 
it could download and store for future use/backup.

Reddit provides personal RSS feed. That is, I have an RSS/Atom feed for my saved posts. Using that,
I can periodically listen/query this endpoint to fetch for new post I have saved and do some
rudimentary checking before downloading the album (i.e. check if its an imgur posts, from a particular sub,
etc.). From there, I can use parse out information to pass into the imgur API to fetch the raw image
links.

## Notes
This project is still pretty buggy and inefficient. I should probably use a connection pool and
have some way to throttle my connection when starting to process. I should also include someway to 
check if I have already downloaded something to avoid using up bandwidth. All in all, I hacked this
together quickly one night.

### TODO:
- [x] Connection Pooling
- [x] Fetch past recent items on rss feed
- [x] Add ability to skip processed items on rate limit
- [x] Avoid fetching existing images based on path
- [ ] Add rate limiting mitigations/throttling
- [ ] Add option to only process recent items

## Structure
```
REDDIT_SAVED_RSS_FEED="link to reddit rss feed"
IMGUR_CLIENT_SECRET="imgur client secret"

ENABLE_LOG_SUMMARY="true or false value to enable more robust logging"
DESTINATION="where to drop off image and pdf"
CONNECTIONS=integer value of sockets to use for requests
START_AFTER="reddit id to start after"
```
`.env` variables needed to be defined.

All images are stored using this path convention
```
DESTINATION/SUBREDDIT_SOURCE/POST_TITLE                 # base path
                                       /page_0[1-9].png 
                                       /page_[10+].png  # prefixed 0 if page download is between 0-9
                                       /POST_TITLE.pdf  # all pages stitched together
```

Use `START_AFTER` if you are rate limited skip processing of previous feed elements. A
reddit `id` is posted in the logs every batch. Use `CONNECTIONS` to use set a limit on the 
number of connections used to fetch data. 

After every `rss` batch, there will be a `3` second delay before the next batch starts. This
is to just to allow I/O processes to keep up and as a rudimentary delay from hitting the 
imgur servers too frequently.

PDF stitch will always be regenerated. I currently do not have a way to detect if a previously
missing image has been fetched (i.e. missing because of rate limiting/partial batch processing).
