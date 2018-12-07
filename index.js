const express = require('express');
const { Issuer } = require('openid-client');
const process = require('process');
const { URLSearchParams } = require('url');
const bodyParser = require('body-parser');
const dynamoClient = require('./dynamo_client');

const ROOT_URL =  'https://deptva-eval.okta.com/oauth2/default/'
const secret = "oauth_redirect_test";
const redirect_uri = 'http://localhost:8080/redirect'
const metadataRewrite = {
  authorization_endpoint: 'http://localhost:8080/authorize',
  token_endpoint: 'http://localhost:8080/token',
}
const metadataRemove = [
  "request_uri_parameter_supported",
  "require_request_uri_registration",
  "claim_types_supported",
  "claims_parameter_supported",
]
const dynamo = dynamoClient.createClient(
  'http://localhost:8000',
  {
    accessKeyId: 'NONE',
    region: 'us-west-2',
    secretAccessKey: 'NONE',
  },
);

async function createIssuer() {
  return await Issuer.discover(ROOT_URL);
}

function startApp(issuer) {
  const app = express();
  const port = process.env.PORT || 8080;
  app.use(bodyParser.urlencoded());

  app.get('/.well-known/smart-configuration.json', (req, res) => {
    const metadata = {...issuer.metadata, ...metadataRewrite }
    res.send(metadataRemove.reduce((meta, keyToRemove) => {
      delete meta[keyToRemove];
      return meta;
    }, metadata));
  });

  app.get('/redirect', async (req, res) => {
    const { state } = req.query;
    await dynamoClient.saveToDynamo(dynamo, state, "code", req.query.code);
    const params = new URLSearchParams(req.query);
    const document = await dynamoClient.getFromDynamoByState(dynamo, state);
    res.redirect(`${document.redirect_uri.S}?${params.toString()}`)
  });

  app.get('/authorize', async (req, res) => {
    const { state } = req.query;
    await dynamoClient.saveToDynamo(dynamo, state, "redirect_uri", req.query.redirect_uri)
    const params = new URLSearchParams(req.query);
    params.set('redirect_uri', redirect_uri);
    res.redirect(`${issuer.metadata.authorization_endpoint}?${params.toString()}`)
  });

  app.post('/token', async (req, res) => {
    const [ client_id, client_secret ] = Buffer.from(
      req.headers.authorization.match(/^Basic\s(.*)$/)[1], 'base64'
    ).toString('utf-8').split(':');
    const client = new issuer.Client({
      client_id,
      client_secret,
      redirect_uris: [
        'http://localhost:8080/redirect',
      ],
    });
    let tokens, state;
    if (req.body.grant_type === 'refresh_token') {
      tokens = await client.refresh(req.body.refresh_token);
      const document = await dynamoClient.getFromDynamoBySecondary(dynamo, 'refresh_token', req.body.refresh_token);
      state = document.state.S;
      await dynamoClient.saveToDynamo(dynamo, state, 'refresh_token', tokens.refresh_token);
    } else if (req.body.grant_type === 'authorization_code') {
      tokens = await client.grant(
        {...req.body, redirect_uri }
      );
      const document = await dynamoClient.getFromDynamoBySecondary(dynamo, 'code', req.body.code);
      state = document.state.S;
      await dynamoClient.saveToDynamo(dynamo, state, 'refresh_token', tokens.refresh_token);
    } else {
      throw Error('Unsupported Grant Type');
    }
    const tokenData = await client.introspect(tokens.access_token);
    if (tokenData.scope.split(' ').indexOf('launch/patient') > -1) {
      const { patient } = tokenData;
      res.json({...tokens, patient, state});
    } else {
      res.json({...tokens, state});
    }
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
