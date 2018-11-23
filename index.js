const fs = require("fs");
const spinalCore = require("spinal-core-connectorjs");
const config = require("./config"); // get the config

// import the graph Elements model definition
require("spinalgraph");
require("spinal-models-timeSeries");

// connection string to connect to spinalhub
const connect_opt = `http://${config.spinalConnector.user}:${
  config.spinalConnector.password
}@${config.spinalConnector.host}:${config.spinalConnector.port}/`;

// initialize the connection
const conn = spinalCore.connect(connect_opt);

// get the Model from the spinalhub
spinalCore.load(conn, config.file.path, onLoadSuccess, onLoadError);

// called file not found
function onLoadError() {
  console.log(
    `${config.appName} file does not exist in location ${config.file.path}`
  );
}

// called if connected to the server and the spinalhub sent us the Model
function onLoadSuccess(_file) {
  console.log("Connected to the server and got a the Entry Model");
  _file.graph
    .getContext(config.appName)
    .then(onGetContext)
    .then(onResult)
    .catch(console.error);
}

async function onGetContext(networkContext) {
  if (typeof networkContext !== "undefined") {
    // we got the context, get the devices
    let promises = [];
    let allDevices = await networkContext.getChildren(["hasDevice"]);
    for (var i = 0; i < allDevices.length; i++) {
      promises.push(getDevice(allDevices[i]));
    }
    return Promise.all(promises);
  } else {
    console.error(`No context "${config.appName}" found.`);
    return [];
  }
}

// result object is the completed representation of the JSON.
function onResult(result) {
  // redefine this part if needed
  try {
    let output = JSON.stringify(result, null, 2);
    const ws = fs.createWriteStream(config.file.output);
    ws.write(output, e => {
      if (e) console.error(e);
      else
        console.log("Export successful output wrote in ", config.file.output);
      ws.close();
      process.exit(1);
    });
  } catch (e) {
    console.error(e);
  }
}

// create a json of a device
function getDevice(deviceNode) {
  const promiseDeviceElement = deviceNode.getElement();
  const promiseEndpoints = deviceNode.getChildren(["hasEndpoint"]);

  return Promise.all([promiseDeviceElement, promiseEndpoints]).then(result => {
    let deviceElement = result[0];
    let endpoints = result[1];
    let device = deviceElement.get();
    return getEndpoint(endpoints, device);
  });
}

// create a json of a endpoint
function getEndpoint(endpoints, device) {
  let promiseEndpoint = [];
  if (endpoints.length < 0) return device;
  for (let i = 0; i < endpoints.length; i++) {
    promiseEndpoint.push(getEndpointElementAndHistory(endpoints[i]));
  }
  return Promise.all(promiseEndpoint).then(endpointElements => {
    device.endpoints = endpointElements;
    return device;
  });
}

// get the endPoint Element and history Nodes
function getEndpointElementAndHistory(endpoint) {
  const promiseEndpintElement = endpoint.getElement();
  const promiseHistory = endpoint.getChildren(["hasHistory"]);

  return Promise.all([promiseEndpintElement, promiseHistory]).then(result => {
    let endpointElement = result[0];
    let historyNodes = result[1];
    let endpoint = endpointElement.get();
    return getHistory(historyNodes, endpoint);
  });
}

// load the Timeseries from the history node
function getHistory(historyNodes, endpoint) {
  let promiseHistory = [];
  if (historyNodes.length < 0) return endpoint;
  for (let i = 0; i < historyNodes.length; i++) {
    promiseHistory.push(historyNodes[i].getElement());
  }
  return Promise.all(promiseHistory).then(async function(historyElements) {
    endpoint.history = await getTimeSeriesOfYesterday(historyElements[0]);
    return endpoint;
  });
}

// extract the data from the TimeSeries from yesterday 00:00 to today 00:00
async function getTimeSeriesOfYesterday(historyElement) {
  const dateMinus1day = getTodayDateAt0();
  dateMinus1day.setDate(dateMinus1day.getDate() - 1);
  const now = getTodayDateAt0();
  // const now = new Date();
  const history = await historyElement.getTimeSeriesBetweenDates(
    dateMinus1day.getTime(),
    now.getTime()
  );
  const res = {
    frequency: historyElement.frequency.get(),
    archiveTime: historyElement.archiveTime.get(),
    start: dateMinus1day.getTime(),
    end: now.getTime(),
    data: history.map(e => e.get())
  };
  return res;
}

// utility function to create a Date set at today midnight
function getTodayDateAt0() {
  const date = new Date();
  date.setHours(0);
  date.setMinutes(0);
  date.setSeconds(0);
  date.setMilliseconds(0);
  return date;
}
