exports.save_metadata = async (event) => {
    console.log("Event recieved:", JSON.stringify(event))


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