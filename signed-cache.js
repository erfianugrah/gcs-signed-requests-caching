export default {
    async fetch(request, env, ctx) {

        // Parse the service account JSON from the environment variable
        const bucketName = env.GCS_BUCKET
        const keyData = JSON.parse(env.GCS_JSON)
        const sevice_account_email = env.GCS_SERVICE_ACCOUNT_EMAIL

        // Get the header of the OAUTH request
        const GOOGLE_KEY_HEADER = objectToBase64url({
            alg: 'RS256',
            typ: 'JWT',
        })

        // Determine the issue and expiration date for the claimset
        const iat = Math.round(Date.now() / 1000)

        // Expires in an hour (that is the max allowed)
        const exp = iat + 3600

        // Generate the claimset payload
        const claimset = objectToBase64url({
            iss: sevice_account_email,
            // Grab the scope from https://cloud.google.com/storage/docs/authentication#oauth-scopes
            scope: 'https://www.googleapis.com/auth/devstorage.read_write',
            aud: 'https://www.googleapis.com/oauth2/v4/token',
            exp,
            iat,
        })

        const jwk = keyData

        // Import the Key into a CryptoKey object
        // This will export a private key, only used for signing
        const key = await crypto.subtle.importKey(
            'jwk',
            {
                ...jwk,
                // Add alg: 'RS256' to it
                alg: 'RS256',
            },
            {
                name: 'RSASSA-PKCS1-v1_5',
                hash: {
                    name: 'SHA-256',
                },
            },
            false,
            ['sign'],
        )

        // Sign the header and claimset 
        const rawToken = await crypto.subtle.sign(
            { name: 'RSASSA-PKCS1-v1_5' },
            key,
            new TextEncoder().encode(`${GOOGLE_KEY_HEADER}.${claimset}`),
        )

        // Convert the token to Base64URL format
        const token = arrayBufferToBase64Url(rawToken)

        // Make the OAUTH request
        const oauth_response = await fetch('https://www.googleapis.com/oauth2/v4/token', {
            method: 'POST',
            headers: new Headers({
                'Content-Type': 'application/json',
            }),
            body: JSON.stringify({
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion: `${GOOGLE_KEY_HEADER}.${claimset}.${token}`,
            }),
        })

        // Grab the JSON from the response
        const oauth = await oauth_response.json()

        // Looks like:
        // {
        //   access_token:
        //     'LONG STRING',
        //   expires_in: 3600,
        //   token_type: 'Bearer',
        // }

        /**
         * Helper methods for getting things to/from base64url and array buffers
         */
        function objectToBase64url(payload) {
            return arrayBufferToBase64Url(
                new TextEncoder().encode(JSON.stringify(payload)),
            )
        }

        function arrayBufferToBase64Url(buffer) {
            return btoa(String.fromCharCode(...new Uint8Array(buffer)))
                .replace(/=/g, '')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
        }

        const authHeaderValues = `${oauth.token_type} ${oauth.access_token}`

        try {
            // Instantiate new URL to make it mutable
            const newUrl = new URL(request.url)
            newUrl.pathname = `${bucketName}${newUrl.pathname}`

            const newRequest = new Request(newUrl, request)
            newRequest.headers.set("Authorization", authHeaderValues)

            // Set const to be used in the array later on
            const customCacheKey = `${newUrl.hostname}${newUrl.pathname}`
            const queryCacheKey = `${newUrl.hostname}${newUrl.pathname}${newUrl.search}`

            // const ifRange = request.headers.has('Range')
            // const range = ifRange ? request.headers.get('Range') : ''

            // Here we set all variables needed to manipulate Cloudflare's cache using the fetch API in the cf object, we'll be passing these variables in the objects down
            const cacheAssets = [
                { asset: 'video', key: customCacheKey, regex: /(.*\/Video)|(.*\.(m4s|mp4|ts|avi|mpeg|mpg|mkv|bin|webm|vob|flv|m2ts|mts|3gp|m4v|wmv|qt))/, info: 0, ok: 31556952, redirects: 30, clientError: 10, serverError: 0, cacheTag: 'signed-video' },
                { asset: 'image', key: queryCacheKey, regex: /(.*\/Images)|(.*\.(jpg|jpeg|png|bmp|pict|tif|tiff|webp|gif|heif|exif|bat|bpg|ppm|pgn|pbm|pnm))/, info: 0, ok: 3600, redirects: 30, clientError: 10, serverError: 0, cacheTag: 'signed-image' },
                { asset: 'frontEnd', key: queryCacheKey, regex: /^.*\.(css|js)/, info: 0, ok: 3600, redirects: 30, clientError: 10, serverError: 0, cacheTag: 'signed-frontEnd' },
                { asset: 'audio', key: customCacheKey, regex: /(.*\/Audio)|(.*\.(flac|aac|mp3|alac|aiff|wav|ogg|aiff|opus|ape|wma|3gp))/, info: 0, ok: 31556952, redirects: 30, clientError: 10, serverError: 0, cacheTag: 'signed-audio' },
                { asset: 'directPlay', key: customCacheKey, regex: /.*(\/Download)/, info: 0, ok: 31556952, redirects: 30, clientError: 10, serverError: 0, cacheTag: 'signed-directPlay' },
                { asset: 'manifest', key: customCacheKey, regex: /^.*\.(m3u8|mpd)/, info: 0, ok: 3, redirects: 2, clientError: 1, serverError: 0, cacheTag: 'signed-manifest' }
            ]

            // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/find we'll be using the regex to match on file extensions for caching
            let { asset, regex, ...cache } = cacheAssets.find(({ regex }) => newUrl.pathname.match(regex)) ?? {}

            const newResponse = await fetch(newRequest,
                {
                    // headers:{
                    //     Authorization: `${oauth.token_type} ${oauth.access_token}`,
                    //     Range: range
                    // },
                    cf:
                    {
                        cacheKey: cache.key,
                        polish: false,
                        cacheEverything: true,
                        cacheTtlByStatus: {
                            '100-199': cache.info,
                            '200-299': cache.ok,
                            '300-399': cache.redirects,
                            '400-499': cache.clientError,
                            '500-599': cache.serverError
                        },
                        cacheTags: [
                            cache.cacheTag
                        ]
                    }
                })
                
            const response = new Response(newResponse.body, newResponse)
            let cacheControl = '';

            // Find the matching asset in the cacheAssets array
            let matchedAsset = cacheAssets.find(asset => asset.regex.test(newUrl));

            if (matchedAsset) {
                // Set the cache-control header based on the asset type
                if (response.status >= 200 && response.status < 300) {
                    cacheControl = `public, max-age=${matchedAsset.ok}`;
                } else if (response.status >= 300 && response.status < 400) {
                    cacheControl = `public, max-age=${matchedAsset.redirects}`;
                } else if (response.status >= 400 && response.status < 500) {
                    cacheControl = `public, max-age=${matchedAsset.clientError}`;
                } else if (response.status >= 500 && response.status < 600) {
                    cacheControl = `public, max-age=${matchedAsset.serverError}`;
                }
            }

            // Set the cache-control header on the response
            response.headers.set('Cache-Control', cacheControl);

            // For debugging purposes
            if (newRequest.headers.get('erfi') === 'test')
                response.headers.set('debug', JSON.stringify(cache))

            // Delete goog headers
            const googHeaders = /x-goog|x-guploader/i;

            for (let header of response.headers) {
                // If the header name matches the regex, delete it
                if (googHeaders.test(header[0])) {
                    response.headers.delete(header[0]);
                }
            }
            return response

        }
        catch (e) {
            console.log(e)
            return new Response(
                JSON.stringify({ code: 500, message: `unable to sign request: ${e}` }),
                { status: 500, statusText: "Internal Server Error" }
            )
        }
    }
}