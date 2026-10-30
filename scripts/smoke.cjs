const { summarizeUrl } = require('../src/summarize.cjs');

const url = process.argv[2] || 'https://example.com';

summarizeUrl(url)
  .then((result) => {
    console.log(JSON.stringify({
      title: result.title,
      site: result.site,
      type: result.type,
      provider: result.provider,
      warning: result.warning,
      transcriptSource: result.transcriptSource,
      charCount: result.meta.charCount,
      language: result.meta.language,
      tldr: result.summary.tldr,
      bullets: result.summary.bullets,
      longSummary: result.summary.longSummary
    }, null, 2));
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
