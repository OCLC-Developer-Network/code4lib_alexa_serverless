# Alexa Ask WorldCat Lambda

Custom application allow users to find closest library with a book title

Sample voice interaction:

* User: Alexa, launch WorldCat.
* Alexa: Ask me to find a book for you. For example, you can say, "Where can I find 'On the Road'?"
* User: Where can I find "On the Road"?
* Alexa: The closest library where you can find "On the Road" by Kerouac, Jack is Worthington Libraries. Do you need the library's address?
* User: Yes.
* Alexa: I've sent the address to your device.
* Card displays on Amazon Alexa app and/or Echo device:
    * Worthington Libraries / 820 High Street, Worthington, OH, 43085, United States
* User: Find public libraries near me
* Alexa: The nearest public library is "Worthington Libraries / 820 High Street, Worthington, OH, 43085, United States"    

## Setup Part 1 - AWS Lambda

### Install Locally

#### Step 1: Clone the repository
Clone this repository

```bash
$ git clone {url}
```
or download directly from GitHub.

Change into the application directory

#### Step 2: Use npm to install dependencies
Download node and npm and use the `install` command to read the dependencies JSON file 

```bash
$ npm install
```

#### Step 3: Configure application
1. Request a WSKey for WorldCat Search API and WorldCat Registry API - http://platform.worldcat.org/wskey/
- a Sandbox WSKey will work fine for this demo

2. Copy example_config.yml to prod_config.yml . Open prod_config.yml and edit to include:
- wskey
- secret
- zip_code

#### Step 4: AWS Setup

1. Install AWS Commandline tools
- https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html
I reccomend using pip.
2. Create an AWS user in IAM console. Give it appropriate permissions. Copy the key and secret for this user to use in the CLI. 
3. Configure the commandline tools - https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html

- Make sure you add 
-- key/secret
-- region

#### Step 5: Encrypt your Credentials

1. Create a KMS key

2. Encrypt the config file

```bash
$ aws kms encrypt --key-id {key-id} --plaintext fileb://prod_config.yml --output text --query CiphertextBlob --output text | base64 -D > prod_config_encrypted.txt
```

### Step 6: Test application
1. Use serverless to test locally

```bash
serverless invoke local --function checkOCLCNumber --path alexa_launch_event.json
```

##Installing in AWS Lambda

1. Download and setup the application, see Installing locally
2. Edit serverless.yml so it includes your key ARN

```
service: 
    name: alexa-worldcat-example
    awsKmsKeyArn: arn:aws:kms:us-east-1:XXXXXX:key/some-hash
```

3. Deploy the code using serverless

```bash
$ serverless deploy
```

4. Go to the AWS Lambda console
- Make sure the role for the Lambda has the right permissions: KMS decrypt
- Setup the Alexa Skill Kit trigger on the Lambda
- Note the ARN for the Lambda

## Setup Part 2 - Amazon Developer Console

1. Create or sign in to your [Amazon Developer Console](https://developer.amazon.com/).
2. Select Your Alexa Dashboards.
3. Select Alexa Skills Kit.
4. Add a New Skill.
5. Skill Information:
    1. Name = "Ask WorldCat"
    2. Invocation Name = "world cat"
    3. Leave all the other default options.
    4. Save > Next
6. Interaction Model:
    1. Go to JSON Editor: copy and paste the contents of [model.json](assets/model.json).
    2. Save > Next
7. Configuration:
    1. Service Endpoint Type:
        1. Select "AWS Lambda ARN"
        2. Copy and paste your AWS Lambda ARN into the text box.
    2. Leave all the other default options.
    3. Save > Next

## Test

1. Test your Skill using the Voice Simulator or the Service Simulator in the Developer Console.
2. For example, entering the text "Where can I find Hillbilly Elegy?" in the Service Simulator will produce a request and response