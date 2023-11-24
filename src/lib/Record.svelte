<script lang="ts">
	import { settingsStore } from '$misc/stores';
	import { Microphone, Stop } from '@inqling/svelte-icons/heroicon-24-solid';
	import { createEventDispatcher, onMount } from 'svelte';
	import { MicVAD, utils } from '@ricky0123/vad-web';
	import * as ort from "onnxruntime-web";

	export let startRecordingOnLoad: boolean = false;

	// Re-configure ort
	ort.env.wasm.wasmPaths = {
		"ort-wasm-simd-threaded.wasm": "/ort-wasm-simd-threaded.wasm",
		"ort-wasm-simd.wasm": "/ort-wasm-simd.wasm",
		"ort-wasm.wasm": "/ort-wasm.wasm",
		"ort-wasm-threaded.wasm": "/ort-wasm-threaded.wasm",
	};

	let isRecording = false;
	const dispatch = createEventDispatcher();

	let vadLoading: boolean = true;
	let vadError: Error | null = null;
	let vadListening: boolean = false;
	let vad: MicVAD | null = null;

	onMount(() => {
		async function doSetup() {
			await setupVad();
		}
		
		doSetup();

		return () => {
			console.log('Clean up vad');
			vadPause();
		};
	});

	function onSpeechEnd(audio: Float32Array) {
		console.log('Vad speech end');
		
		const wavBuffer = utils.encodeWAV(audio);
		// const base64 = utils.arrayBufferToBase64(wavBuffer);
		// const url = `data:audio/wav;base64,${base64}`;
		
		const audioBlob = new Blob([wavBuffer]);
		const audioFile = new File([audioBlob], 'recordedAudio.wav', { type: 'audio/wav' });
		transcribe(audioFile);
	}

	function onSpeechStart() {
		console.log('Vad speech start');
	}

	async function setupVad() {
		let myvad: MicVAD | null;

		try {
			myvad = await MicVAD.new({
				modelURL: "/silero_vad.onnx",
			    workletURL: "/vad.worklet.bundle.min.js",
				positiveSpeechThreshold: 0.8,
				onSpeechEnd,
				onSpeechStart
			});
			console.log('Finished setting up vad');
		} catch (e) {
			console.error(e);
			vadError = e as Error;
			return;
		}

		vad = myvad;
		vadLoading = false;

		if (startRecordingOnLoad) {
			myvad?.start();
			vadListening = true;
		}
	}

	function vadPause() {
		if (!vadLoading && !vadError) {
			console.log('Pause vad');
			vad?.pause()
			vadListening = false;
		}
	}

	function vadStart() {
		if (!vadLoading && !vadError) {
			console.log('Start vad');
			vad?.start()
			vadListening = true;
		}
	}

	async function startRecording() {
		isRecording = true;
		vadStart();
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

		console.log('Message', msg);
		dispatch('transcribe', msg);
	}

	function stopRecording() {
		vadPause();
		isRecording = false;
	}

	function toggleRecording() {
		console.log('Toggling recording');
		if (isRecording) {
			console.log('Stop recording');
			stopRecording();
		}
		else { 
			console.log('Start recording');
			startRecording();
		}
	}
</script>

<button type="button" class="btn btn-sm ml-2" on:click={toggleRecording}>
	{#if isRecording}
		<Stop class="w-6 h-6 text-red-600" />
	{:else}
		<Microphone class="w-6 h-6" />
	{/if}
</button>