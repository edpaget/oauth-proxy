const express = require('express');
const { Issuer } = require('openid-client');
const process = require('process');
const session = require('express-session');
const { URLSearchParams } = require('url');

const ROOT_URL =  'https://deptva-eval.okta.com/oauth2/default/'
const secret = "oauth_test";
const metadataRewrite = {
  authorization_endpoint: 'http://localhost:8080/authorize',
  token_endpoint: 'http://localhost:80080/token',
}
const metadataRemove = [
  "request_uri_parameter_supported",
  "require_request_uri_registration",
  "claim_types_supported",
  "claims_parameter_supported",
]


async function createIssuer() {
  return await Issuer.discover(ROOT_URL);
}

function startApp(issuer) {
  const app = express();
  const port = process.env.PORT || 8080;
  app.use(session({ secret }));

  app.get('/.well-known/smart-configuration.json', (req, res) => {
    const metadata = Object.assign(issuer.metadata, metadataRewrite)
    res.send(metadataRemove.reduce((meta, keyToRemove) => {
      delete meta[keyToRemove];
      return meta;
    }, metadata));
  });

  app.get('/redirect', (req, res) => {
    console.log(req.query);
    req.session.auth_requests[req.query.state].code = req.query.code;
    const params = new URLSearchParams(req.query);
    res.redirect(`${req.session.auth_requests[req.query.state].redirect_uri}?${params.toString()}`)
  });

  app.get('/authorize', (req, res) => {
    console.log(req.query);
    if (!req.session.auth_requests) {
      req.session.auth_requests = {};
    }
    req.session.auth_requests[req.query.state] = {redirect_uri: req.query.redirect_uri};
    const params = new URLSearchParams(req.query);
    params.set('redirect_uri', 'http://localhost:8080/redirect');
    res.redirect(`${issuer.metadata.authorization_endpoint}?${params.toString()}`)
  });

  app.post('/token', (req, res) => {
    console.log(req);
  });

  app.listen(port, () => console.log(`Example app listening on port ${port}!`));
  return app;
}

(async () => {
  try { 
    const issuer = await createIssuer();
    startApp(issuer);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();

module.exports = {
  createIssuer,
  startApp,
}
