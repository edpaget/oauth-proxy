const { config, DynamoDB } = require('aws-sdk');

config.update({
  accessKeyId: 'NONE',
  region: 'us-west-2',
  secretAccessKey: 'NONE',
});

const dynamo = new DynamoDB({
  endpoint: 'http://dynamodb:8000',
});

const tableParams = {
  AttributeDefinitions: [
    { AttributeName: 'state', AttributeType: 'S' },
  ],
  KeySchema: [
    { AttributeName: 'state', KeyType: 'HASH' },
  ],
  ProvisionedThroughput: {
    ReadCapacityUnits: 10,
    WriteCapacityUnits: 10
  },
  TableName: 'OAuthRequests',
};

dynamo.createTable(tableParams, (err, data) => {
  if (err) {
    console.error('Unable to create table. Error JSON:', JSON.stringify(err, null, 2));
  } else {
    console.log('Created table. Table description JSON:', JSON.stringify(data, null, 2));
  }
});
