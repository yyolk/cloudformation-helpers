var AWS = require('aws-sdk');
var dynamoDB = new AWS.DynamoDB();
var response = require('./lib/cfn-response');

exports.dynamoDBPutItems = function(event, context) {
  var p = event.ResourceProperties;
  if (event.RequestType == 'Delete') {
    response.send(event, context, response.SUCCESS);
    return;
  }

  if (!Array.isArray(p.Items)) {
    error("Must specify a list of items to insert.", event, context);
  } else if (p.TableName === undefined) {
    error("Must specify a table to insert into.", event, context);
  } else {
    putItems(p.Items, p.TableName, event, context, []);
  }
}

// Puts items into DynamoDB, iterating over the list recursively.
function putItems(items, tableName, event, context, itemsInserted) {
  if(items.length > 0){
    var item = items.pop();
    console.log('Putting item [' + item.key + '] into DB [' + tableName + ']');
    dynamoDB.putItem(
      {
        TableName: tableName,
        Item: formatForDynamo(item, true)
      },
      function(err,data) {
        if (err) {
          error(err, event, context);
        } else {
          itemsInserted.push(item.key);
          putItems(items, tableName, event, context, itemsInserted);
        }
      }
    );
  } else {
    response.send(event, context, response.SUCCESS, { "ItemsInserted": itemsInserted });
  }
}

// Translates from raw JSON into DynamoDB-formatted JSON. This is more than a
// convenience thing: the original iteration of this accepted DyanamoDB-JSON Items,
// to avoid complications in translation. But when CloudFormation passes the parameters
// throught the event model, all non-string values get wrapped in quotes. For Booleans
// specifically, this is a problem - because DynamoDB does not allow a string (even if
// it is 'true' or 'false') as a 'BOOL' value. So some translation was needed, and
// it seemed best to then simplify things for the client by accepting raw JSON.
function formatForDynamo(value, topLevel) {
  var result = undefined;
  if (value == 'true' || value == 'false') {
    result = {'BOOL': value == 'true'}
  } else if (!isNaN(value)) {
    result = {'N': value}
  } else if (Array.isArray(value)) {
    var arr = [];
    for (var i = 0; i < value.length; i++) {
      arr.push(formatForDynamo(value[i], false));
    }
    result = {'L': arr};
  } else if (typeof value  === "object") {
    var map = {};
    Object.keys(value).forEach(function(key) {
      map[key] = formatForDynamo(value[key], false)
    });
    if (topLevel) result = map;
    else result = {'M': map}
  } else {
    result = {'S': value}
  }
  return result;
}

function error(message, event, context) {
  console.error(message);
  response.send(event, context, response.FAILED, { Error: message });  
}