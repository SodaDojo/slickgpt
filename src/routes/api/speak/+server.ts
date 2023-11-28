import type { RequestHandler } from "@sveltejs/kit";
import OpenAI from "openai";
import { OPENAI_API_KEY } from '$env/static/private';

export const POST: RequestHandler = async ({ request, fetch }) => {
    const { apiKey, message } = await request.json()
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY || apiKey });

    const response = await openai.audio.speech.create({
        model: "tts-1",
        voice: "nova",
        input: message,
    });
    
    const mp3 = Buffer.from(await response.arrayBuffer());
    return new Response(mp3, {
        headers: {
            'Content-Type': 'audio/mpeg'
        }
    })
}