**[Steps to get a JSON Web Key (JWK) for a Google Service Account](https://community.cloudflare.com/t/connecting-to-google-storage/32350)** 
---
### courtesy of [webchad](https://community.cloudflare.com/u/webchad/)
---
<u>Step 1a - Create a service account</u>

Sign into the Google Cloud Console
Go to the IAM & admin; Service accounts

```
https://console.cloud.google.com/iam-admin/serviceaccounts
```

- Click the create service account button
- Enter a name
- Choose a role, under Storage, I choose Storage Object Creator. This will give the worker rights to create and edit, but not delete or change any bucket settings.
- There is no need to check Furnish a new private key, unless you want to use this service worker with the Google SDKs.
- Click the Save button
- Note the email for the new account

<u>Step 1b - Use an existing service account</u>

- Sign into the Google Cloud Console
- Go to the IAM & admin; Service accounts

```
https://console.cloud.google.com/iam-admin/serviceaccounts
```

- Click to choose the service account to connect with
- Note the email for the account

<u>Step 2 - Create a P12 key</u>

- Click the edit button
- Click the create a key button
- Choose P12, click the create button

```
Google will download the certificate, save it for later. The password notasecret will be needed at a later step.
```

Click close

<u>Step 3 - Convert the P12 key to an RSA Private key</u>

Thanks to Google for providing a P12 to PEM conversion tool: https://github.com/google/google-p12-pem

Install the package

```
npm install google-p12-pem
```

And convert

```
./node_modules/google-p12-pem/build/src/bin/gp12-pem.js PATH/TO/KEY.p12 > private.pem
```

Note: there is probably a better way to run

<u>Step 4 - Convert the RSA Private key to JWK: https://github.com/dannycoates/pem-jwk</u>

Install the package

```
npm install pem-jwk
```

And convert

```
 node_modules/pem-jwk/bin/pem-jwk.js PEM/FROM/STEP3/private.pem > private.json
```
