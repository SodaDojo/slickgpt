<script lang="ts">
	import { isRecordingStore, settingsStore, vadStore } from '$misc/stores';
	import { Microphone, Stop } from '@inqling/svelte-icons/heroicon-24-solid';
	import { createEventDispatcher, onMount } from 'svelte';
	import { MicVAD, utils } from '@ricky0123/vad-web';
	import * as ort from "onnxruntime-web";

	export let startRecordingOnLoad: boolean = false;
	export let autoSubmitMs: number = 3000;

	// Re-configure ort
	ort.env.wasm.wasmPaths = {
		"ort-wasm-simd-threaded.wasm": "/ort-wasm-simd-threaded.wasm",
		"ort-wasm-simd.wasm": "/ort-wasm-simd.wasm",
		"ort-wasm.wasm": "/ort-wasm.wasm",
		"ort-wasm-threaded.wasm": "/ort-wasm-threaded.wasm",
	};

	const dispatch = createEventDispatcher();

	let vadLoading: boolean = false;
	let vadError: Error | null = null;
	let autoSubmitTimerId: any;
	
	onMount(() => {
		async function doSetup() {
			await setupVad();
		}
		
		doSetup();
	});

	function onSpeechEnd(audio: Float32Array) {
		stopAutoTimer();

		const wavBuffer = utils.encodeWAV(audio);
		// const base64 = utils.arrayBufferToBase64(wavBuffer);
		// const url = `data:audio/wav;base64,${base64}`;
		
		const audioBlob = new Blob([wavBuffer]);
		const audioFile = new File([audioBlob], 'recordedAudio.wav', { type: 'audio/wav' });
		transcribe(audioFile);
	}

	function onSpeechStart() {
		stopAutoTimer();
	}

	function stopAutoTimer() {
		if (autoSubmitTimerId) {
			clearTimeout(autoSubmitTimerId);
			autoSubmitTimerId = undefined;
		}
	}

	function startAutoTimer() {
		stopAutoTimer();

		autoSubmitTimerId = setTimeout(() => {
			submitMessage();
		}, autoSubmitMs);
	}

	function submitMessage() {
		dispatch('submitMessage');
	}

	async function setupVad() {
		if ($vadStore) {
			return;
		}

		vadLoading = true;
		let myvad: MicVAD | null;

		try {
			myvad = await MicVAD.new({
				modelURL: "/silero_vad.onnx",
			    workletURL: "/vad.worklet.bundle.min.js",
				positiveSpeechThreshold: 0.8,
				onSpeechEnd,
				onSpeechStart
			});
		} catch (e) {
			console.error(e);
			vadError = e as Error;
			return;
		} finally {
			vadLoading = false
		}

		vadStore.set(myvad);

		if (startRecordingOnLoad) {
			startRecording();
		}
	}

	function stripPunctuation(str: string): string {
    	return str.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '').trim().toLowerCase();
	}

	async function transcribe(audioFile: File) {
		const formData = new FormData();
		formData.append('audioFile', audioFile);
		formData.append('apiKey', $settingsStore.openAiApiKey as string);
		const response = await fetch('/api/transcribe', {
			method: 'POST',
			body: formData
		});
		let { msg } = await response.json();

		msg = msg.replace(/\n/g, ' ').trim();
		msg = msg.replace(/\.$/, '');
		
		if (!msg) {
			return;
		}

		if (stripPunctuation(msg) === 'submit') {
			stopAutoTimer();
			submitMessage();
		} else {
			dispatch('transcribe', msg);
			startAutoTimer();
		}
	}

	export const startRecording = async () => {
		isRecordingStore.set(true);
		if ($vadStore) {
			$vadStore.start();
		}
	}

	export const stopRecording = () => {
		stopAutoTimer();
		
		if ($vadStore) {
			$vadStore.pause()
		}
		isRecordingStore.set(false);
	}

	function toggleRecording() {
		if ($isRecordingStore) {
			stopRecording();
		}
		else { 
			startRecording();
		}
	}
</script>

<button type="button" class="btn btn-sm ml-2" on:click={toggleRecording}>
	{#if $isRecordingStore}
		<Stop class="w-6 h-6 text-red-600" />
	{:else}
		<Microphone class="w-6 h-6" />
	{/if}
</button>