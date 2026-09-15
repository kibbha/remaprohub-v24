# ReMaPro AI

Supabase Edge Function used by the ReMaPro Hub web/Android client.

## Cloud AI setup

1. Deploy the function:
   `supabase functions deploy remapro-ai`
2. Configure the server secret:
   `supabase secrets set OPENAI_API_KEY=...`
3. Optional model override:
   `supabase secrets set OPENAI_MODEL=gpt-5.6-luna`
4. In ReMaPro Hub, configure the Supabase project URL and publishable/anon key under **Security & data**, then choose **IA Cloud** under **Settings → ReMaPro AI**.

Never put an OpenAI API key in `app/index.html`, Android assets, localStorage, or GitHub source.

## Health check

The function accepts `{"action":"health"}` and returns whether `OPENAI_API_KEY` is configured. This endpoint does not call OpenAI and is used by ReMaPro Hub's diagnostic screen.

## Local demo

The app also provides a local demo mode for testing the AI interface without a cloud key. It is clearly labeled as demo mode and is not a generative OpenAI response.
