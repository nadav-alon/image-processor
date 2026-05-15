let AWS = require("aws-sdk");

const sqsOptions = {};
if (process.env.AWS_ENDPOINT_URL) {
    sqsOptions.endpoint = process.env.AWS_ENDPOINT_URL;
}
const sqs = new AWS.SQS(sqsOptions);

exports.save_metadata = async (event) => {
    console.log("Event recieved:", JSON.stringify(event))
    let params = {}
    try {
        const data = await sqs.listQueues({}).promise();
        console.log("Success", data.QueueUrls);
    } catch (err) {
        console.error("Error listing queues:", err);
    }


    return {
        statusCode: 200,
        body: JSON.stringify({ message: "Metadata Saved" })
    }
}

exports.process_image = async (event) => {
    console.log("Event recieved:", JSON.stringify(event))


    return {
        statusCode: 200,
        body: JSON.stringify({ message: "Image Processed Successfuly" })
    }
}