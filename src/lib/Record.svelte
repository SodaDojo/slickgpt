<script lang="ts">
	import { settingsStore } from '$misc/stores';
	import { Microphone, Stop } from '@inqling/svelte-icons/heroicon-24-solid';
	import { createEventDispatcher } from 'svelte';

	export let input: string;
	let mediaRecorder: MediaRecorder;
	let recordedAudio: BlobPart[] = [];
	let isRecording = false;
	const dispatch = createEventDispatcher();

	async function startRecording() {
		// Request permissions and start recording
		const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		mediaRecorder = new MediaRecorder(stream);

		mediaRecorder.start();

		// Event to collect audio data
		mediaRecorder.addEventListener('dataavailable', (event) => {
			recordedAudio.push(event.data);
		});

		// Event to save audio data when recording stops
		mediaRecorder.addEventListener('stop', () => {
			const audioBlob = new Blob(recordedAudio);
			const audioUrl = URL.createObjectURL(audioBlob);
			const audio = new Audio(audioUrl);
			const audioFile = new File([audioBlob], 'recordedAudio.mp3', { type: 'audio/mpeg' });
			transcribe(audioFile);
			// audio.play();
		});

		isRecording = true;
	}
	async function transcribe(audioFile: File) {
		const formData = new FormData();
		formData.append('audioFile', audioFile);
		formData.append('apiKey', $settingsStore.openAiApiKey as string);
		const response = await fetch('/api/transcribe', {
			method: 'POST',
			body: formData
		});
		const { msg } = await response.json();
		input = msg;
		dispatch('inputChange');
	}

	function stopRecording() {
		if (mediaRecorder) {
			mediaRecorder.stop();
			isRecording = false;
		}
	}
	function toggleRecording() {
		if (isRecording) stopRecording();
		else startRecording();
	}
</script>

<button type="button" class="btn btn-sm ml-2" on:click={toggleRecording}>
	{#if isRecording}
		<Stop class="w-6 h-6 text-red-600" />
	{:else}
		<Microphone class="w-6 h-6" />
	{/if}
</button>