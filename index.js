/**
 * A Bot for Slack!
 */

const OCAPClient = require('@arcblock/ocap-js');
// init client
const client = new OCAPClient({
  httpBaseUrl: 'https://ocap.arcblock.io/api', // we may have multiple hosts in future
  socketBaseUrl: ds => `wss://ocap.arcblock.io/api/${ds}/socket`,
  dataSource: 'eth', // btc, eth
  enableQuery: true,
  enableSubscription: true,
  enableMutation: true,
});
 
// list api
const queries = client.getQueries();
const subscriptions = client.getSubscriptions();
const mutations = client.getMutations();

const usage = {
    accountByAddress: 'Get account by address: accountByAddress <address>',
    blockByHash: 'Get block by hash: blockByHash <hash>',
    blockByHeight: 'Get block by height: blockByHeight <height>',
    newBlockMined: 'Get new block mined: newBlockMined',
    newContractCreated: 'Get new contract created: newContractCreated',
    bigTransactionExecuted: 'Get big transaction executed:\n    1. To subscribe: bigTransactionExecuted <token>\n    2. Get data: bigTransactionExecuted <token>'
};
const query = {
    accountByAddress: async (address) => {
      const data = await client.accountByAddress({
        address
      });
      console.log(data);
      return data;
    },
    blockByHash: async (hash) => {
      const data = await client.blockByHash({
        hash
      });
      console.log(data);
      return data;
    },
    blockByHeight: async (height) => {
      const data = await client.blockByHeight({
        height
      });
      return parseNBM(data.blockByHeight);
    }
}
const subscription = {
    bigTransactionExecuted: {}
};

const parseNBM = (nBM) => {
    return `----------\nMiner address: ${nBM.miner.address}\nExtra Data Plain: ${nBM.extraDataPlain}\nCurrent Price(per token): $${nBM.priceInUsd}\nHeight: ${nBM.height}\nReward: ${nBM.reward}\nTime: ${nBM.time}\n----------\n`; 
};
// subscription
const subscribe = async () => {
  const sNBM = await client.newBlockMined();
  sNBM.on('data', data => subscription.newBlockMined = parseNBM(data.newBlockMined));
  const sNCC = await client.newContractCreated();
  sNCC.on('data', data => subscription.newContractCreated = data);
}

subscribe();
const bigTransactionExecuted = async (token) => {
  const sBTE = await client.bigTransactionExecuted({
    token
  });
  sBTE.on('data', data => {
    subscription.bigTransactionExecuted[token] = data;
  });
}
/**
 * Define a function for initiating a conversation on installation
 * With custom integrations, we don't have a way to find out who installed us, so we can't message them :(
 */

function onInstallation(bot, installer) {
    if (installer) {
        bot.startPrivateConversation({user: installer}, function (err, convo) {
            if (err) {
                console.log(err);
            } else {
                convo.say('I am a bot that has just joined your team');
                convo.say('You must now /invite me to a channel so that I can be of use!');
            }
        });
    }
}


/**
 * Configure the persistence options
 */

var config = {};
if (process.env.MONGOLAB_URI) {
    var BotkitStorage = require('botkit-storage-mongo');
    config = {
        storage: BotkitStorage({mongoUri: process.env.MONGOLAB_URI}),
    };
} else {
    config = {
        json_file_store: ((process.env.TOKEN)?'./db_slack_bot_ci/':'./db_slack_bot_a/'), //use a different name if an app or CI
    };
}

/**
 * Are being run as an app or a custom integration? The initialization will differ, depending
 */

if (process.env.TOKEN || process.env.SLACK_TOKEN) {
    //Treat this as a custom integration
    var customIntegration = require('./lib/custom_integrations');
    var token = (process.env.TOKEN) ? process.env.TOKEN : process.env.SLACK_TOKEN;
    var controller = customIntegration.configure(token, config, onInstallation);
} else if (process.env.CLIENT_ID && process.env.CLIENT_SECRET && process.env.PORT) {
    //Treat this as an app
    var app = require('./lib/apps');
    var controller = app.configure(process.env.PORT, process.env.CLIENT_ID, process.env.CLIENT_SECRET, config, onInstallation);
} else {
    console.log('Error: If this is a custom integration, please specify TOKEN in the environment. If this is an app, please specify CLIENTID, CLIENTSECRET, and PORT in the environment');
    process.exit(1);
}


/**
 * A demonstration for how to handle websocket events. In this case, just log when we have and have not
 * been disconnected from the websocket. In the future, it would be super awesome to be able to specify
 * a reconnect policy, and do reconnections automatically. In the meantime, we aren't going to attempt reconnects,
 * WHICH IS A B0RKED WAY TO HANDLE BEING DISCONNECTED. So we need to fix this.
 *
 * TODO: fixed b0rked reconnect behavior
 */
// Handle events related to the websocket connection to Slack
controller.on('rtm_open', function (bot) {
    console.log('** The RTM api just connected!');
});

controller.on('rtm_close', function (bot) {
    console.log('** The RTM api just closed');
    // you may want to attempt to re-open
});


/**
 * Core bot logic goes here!
 */
// BEGIN EDITING HERE!

controller.on('bot_channel_join', function (bot, message) {
    const usages = Object.values(usage);
    const reducer = (accumulator, currentValue) => accumulator + currentValue + '\n';
    const usageMsg = usages.reduce(reducer, '');
    bot.reply(message, "There are some examples:\n" + usageMsg);
});

controller.hears(['accountByAddress', 'blockByHash', 'blockByHeight'], 'direct_message', async function (bot, message) {
     const input = message.match.input.split(' ');
     if (!input[1]) {
        bot.reply(message, usage[message.match.input] || 'no data');
     }
     else{
        bot.reply(message, await query[input[0]].call(this, input[1]) || 'no data');
     }
});

controller.hears(['newBlockMined', 'newContractCreated'], 'direct_message', function (bot, message) {
     bot.reply(message, subscription[message.match.input] || 'no data');
});

controller.hears('help', 'direct_message', function (bot, message) {
    const usages = Object.values(usage);
    const reducer = (accumulator, currentValue) => accumulator + currentValue + '\n';
    const usageMsg = usages.reduce(reducer, '');
    bot.reply(message, "There are some examples:\n" + usageMsg);
});

const parseBTE = (bTE) => {
    console.log(bTE);
    return `----------\nSender Address: ${bTE.from.address}\nSender balance: ${bTE.from.balance}\nReceiver Address: ${bTE.to.address}\nReceiver balance: ${bTE.to.balance}\nCurrent Price(per token): $${bTE.priceInUsd}\nTotal: ${bTE.total}\nTime: ${bTE.time}\n----------\n`; 
};

controller.hears('bigTransactionExecuted', 'direct_message', async function (bot, message) {
    const input = message.match.input.split(' ');
    if (!input[1]) {
        bot.reply(message, usage[message.match.input] || 'no data');
    }
    else if (subscription.bigTransactionExecuted[input[1]]) {
        bot.reply(message, 'no data' === subscription.bigTransactionExecuted[input[1]]? 'no data' : parseBTE(subscription.bigTransactionExecuted[input[1]].bigTransactionExecuted));
    }
    else {
        await bigTransactionExecuted(input[1]);
        subscription.bigTransactionExecuted[input[1]] = 'no data';
        bot.reply(message, 'Successfully subscribed');
    }
});



/**
 * AN example of what could be:
 * Any un-handled direct mention gets a reaction and a pat response!
 */
//controller.on('direct_message,mention,direct_mention', function (bot, message) {
//    bot.api.reactions.add({
//        timestamp: message.ts,
//        channel: message.channel,
//        name: 'robot_face',
//    }, function (err) {
//        if (err) {
//            console.log(err)
//        }
//        bot.reply(message, 'I heard you loud and clear boss.');
//    });
//});
