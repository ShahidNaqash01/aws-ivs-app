const express = require('express');
const cors = require('cors');
const AWS = require('aws-sdk');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8000;

app.use(express.json());

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
app.use(cors());

app.post('/api/channel/create', (req, res) => {
    let accessKeyId = req.headers['x-acesskeyid']
    let secretAccessKey = req.headers['x-secretaccesskey']
    accessKeyId = Buffer.from(accessKeyId, 'base64').toString('utf-8');
    secretAccessKey = Buffer.from(secretAccessKey, 'base64').toString('utf-8');
    const {
        authorized,
        insecureIngest,
        latencyMode,
        name,
        recordingConfigurationArn,
        type,
    } = req.body;

    AWS.config.update({
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
        region: 'us-east-1',
    });
    const ivs = new AWS.IVS();
    const params = {
        authorized,
        insecureIngest,
        latencyMode,
        name,
        type,
        recordingConfigurationArn,
    };

    ivs.createChannel(params, (err, data) => {
        if (err) {
            console.error(err);
            res.status(500).json(err);
        } else {
            res.json(data);
        }
    });
});

app.post('/api/channel/delete', (req, res) => {
    let accessKeyId = req.headers['x-acesskeyid']
    let secretAccessKey = req.headers['x-secretaccesskey']
    accessKeyId = Buffer.from(accessKeyId, 'base64').toString('utf-8');
    secretAccessKey = Buffer.from(secretAccessKey, 'base64').toString('utf-8');
    const { arn } = req.body;
    AWS.config.update({
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
        region: 'us-east-1',
    });
    const ivs = new AWS.IVS();
    const params = {
        arn: arn
    };

    ivs.deleteChannel(params, (err, data) => {
        if (err) {
            console.error(err);
            res.status(500).json(err);
        } else {
            res.json(data);
        }
    }
    );
});



app.post('/api/getRecordingURL', async (req, res) => {
    let accessKeyId = req.headers['x-acesskeyid']
    let secretAccessKey = req.headers['x-secretaccesskey']
    accessKeyId = Buffer.from(accessKeyId, 'base64').toString('utf-8');
    secretAccessKey = Buffer.from(secretAccessKey, 'base64').toString('utf-8');
    const { channelArn } = req.body;
    AWS.config.update({
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
        region: 'us-east-1',
    });
    const ivs = new AWS.IVS();
    try {
        const recordingURL = await getRecordingURL(channelArn, ivs);
        res.status(200).json({ recordingURL });
    } catch (error) {
        console.error('Error retrieving recording URL:', error);
        res.status(500).json({ error: error.message });
    }
});

async function getRecordingURL(channelArn, ivs) {
    // const ivs = new AWS.IVS();

    try {
        // Retrieve the recording configuration for the channel
        const channelResponse = await ivs.getChannel({ arn: channelArn }).promise();
        const channel = channelResponse.channel;

        const recordingConfigArn = channel.recordingConfigurationArn;
        const recordingConfigResponse = await ivs.getRecordingConfiguration({ arn: recordingConfigArn }).promise();
        const recordingConfig = recordingConfigResponse.recordingConfiguration;

        // Extract the S3 bucket and key prefix from the recording configuration
        const s3Bucket = recordingConfig.destinationConfiguration.s3.bucketName;
        const s3KeyPrefix = recordingConfig.destinationConfiguration.s3.keyPrefix;

        // Retrieve the recordings in the S3 bucket
        const s3 = new AWS.S3();
        const listObjectsParams = {
            Bucket: s3Bucket,
            Prefix: s3KeyPrefix
        };

        const s3Objects = await s3.listObjectsV2(listObjectsParams).promise();

        // Filter the recordings with the master.m3u8 file from the specific channel
        const channelRecordings = s3Objects.Contents.filter(obj => obj.Key.includes(channelArn.split('/').pop()));

        if (channelRecordings.length > 0) {
            let latestRecording = null;
            let latestLastModified = null;

            // Find the latest recording with the master.m3u8 file based on LastModified date
            for (const recording of channelRecordings) {
                if (recording.Key.endsWith('master.m3u8')) {
                    if (!latestRecording || recording.LastModified > latestLastModified) {
                        latestRecording = recording;
                        latestLastModified = recording.LastModified;
                    }
                }
            }

            if (latestRecording) {
                const params = {
                    Bucket: s3Bucket,
                    Key: latestRecording.Key,
                    Expires: 24 * 60 * 60  // URL expiration time in seconds (adjust as needed)
                };
                console.log(latestRecording)

                const recordingURL = await s3.getSignedUrlPromise('getObject', params);
                return recordingURL;
            }
        }

        throw new Error('No recording found in the specified S3 bucket.');
    } catch (error) {
        console.error('Error retrieving recording URL:', error);
        throw error;
    }
}

