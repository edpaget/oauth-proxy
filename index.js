const express = require('express');
const { Issuer } = require('openid-client');
const process = require('process');
const { URLSearchParams } = require('url');
const { config, DynamoDB } = require('aws-sdk');

const ROOT_URL =  'https://deptva-eval.okta.com/oauth2/default/'
const secret = "oauth_redirect_test";
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
const TableName = "OAuthRequests"
config.update({
  accessKeyId: 'NONE',
  region: 'us-west-2',
  secretAccessKey: 'NONE',
});

const dynamo = new DynamoDB({
  endpoint: 'http://localhost:8000',
});

function getFromDynamo(client, state) {
  const params = {
    Key: {
      "state": {
        S: state,
      },
    },
    TableName,
  };

  return new Promise((resolve, reject) => {
    client.getItem(params, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data.Item);
      }
    });
  });
}

function saveToDynamo(client, state, key, value) {
  const params = {
    ExpressionAttributeNames: {
      "#K": key,
    },
    ExpressionAttributeValues: {
      ":k": {
        S: value,
      },
    },
    Key: {
      "state": {
        S: state,
      },
    },
    ReturnValues: "ALL_NEW",
    UpdateExpression: "SET #K = :k",
    TableName,
  };

  return new Promise((resolve, reject) => {
    client.updateItem(params, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

async function createIssuer() {
  return await Issuer.discover(ROOT_URL);
}

function startApp(issuer) {
  const app = express();
  const port = process.env.PORT || 8080;

  app.get('/.well-known/smart-configuration.json', (req, res) => {
    const metadata = Object.assign({}, issuer.metadata, metadataRewrite)
    res.send(metadataRemove.reduce((meta, keyToRemove) => {
      delete meta[keyToRemove];
      return meta;
    }, metadata));
  });

  app.get('/redirect', async (req, res) => {
    console.log(req.query);
    const { state } = req.query;
    await saveToDynamo(dynamo, state, "code", req.query.code);
    const params = new URLSearchParams(req.query);
    const document = await getFromDynamo(dynamo, state);
    console.log(document);
    res.redirect(`${document.redirect_uri.S}?${params.toString()}`)
  });

  app.get('/authorize', async (req, res) => {
    console.log(req.query);
    const { state } = req.query;
    await saveToDynamo(dynamo, state, "redirect_uri", req.query.redirect_uri)
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
