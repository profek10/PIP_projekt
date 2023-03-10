const express = require('express')
const app = express()
const server = require('http').createServer(app)
const io = require('socket.io')(server)
const bodyParser = require('body-parser')
const path = require('path')
const client = require('socket.io-client')
const Block = require('./block')
const {Worker} = require("worker_threads");
const blockChain = []
const numberOfThreads = 100
let counter = 0
require('dotenv').config()
const { MongoClient } = require('mongodb');

app.use(bodyParser.urlencoded({ extended: false }))
app.use(express.static(path.join(__dirname, 'src/style')))
app.use(express.static(path.join(__dirname, 'src/client')))

const mongo_uri = "mongodb+srv://" + process.env.MONGO_USER + ":" + process.env.MONGO_PASS + "@" + process.env.MONGO_CLUSTER + "/?retryWrites=true&w=majority";
const mongo_client = new MongoClient(mongo_uri);

if (process.argv.length < 3) {
  console.error('Missing port')
  process.exit(1)
}
if (process.argv.length > 3) {
  console.error('Too many arguments')
  process.exit(1)
}
if (parseInt(process.argv[2]) <= 1000 ||
  parseInt(process.argv[2]) > 9999) {
  console.error('Wrong port format')
  process.exit(1)
}
const PORT = process.argv[2]
if (PORT === undefined) {
  process.exit(1)
}

console.log("Executed in the parent thread");

server.listen(PORT, () => {
  console.log(`listening on: ${server.address().address}:${PORT}`)
})

io.on('connection', socket => {
  let sock = null;
  socket.on('join', async (name, port, fn) => {
    console.log(name)
    console.log(port)
    if (port !== undefined) {
      sock = await client.connect(`http://${port}`)
      sock.emit("register", name, PORT)
      sock.on('connect', () => {
        console.log(`Connected at ${port}`)
        fn('Connected')
      })
      sock.on('disconnect', () => {
        console.log(`Disconnected from ${port}`)
        fn('Disconnected')
      })
      console.log("PRE MONGO")
      await mongo_client.connect();
      console.log("AFTER MONGO")
    } else {
      console.log('ERROR')
      fn('Missing data')
    }
  })
  socket.on('mine', async () => {
    const getResult = await mongo_client.db(process.env.MONGO_DATABASE).collection('gyroscope_updates').find({"location":{ $ne:null }});
    let resData = await getResult.toArray();
    for (let i = 0; i < numberOfThreads; i++){

      const start = i * (resData.length / numberOfThreads);
      const end = i == (numberOfThreads - 1)
                           ? resData.length - 1
                           : (i + 1) * (resData.length / numberOfThreads);
      const worker = new Worker("./miner.js", {
        workerData: {
          data: resData.slice(start, end)
        }
      })
      counter++;
      worker.on("message", block => {
        console.log(block);
        sock.emit('blocks', block, (res) => {
          console.log(res);
          socket.emit('mine_data', block, (res) => {
            console.log(res);
          });
        })
      });

      worker.on("error", error => {
        console.log(error);
      });

      worker.on("exit", exitCode => {
        console.log(exitCode);
      })
    }
  })
})
