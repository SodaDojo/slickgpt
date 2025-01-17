<script lang="ts">
	import { useSsrOpenAiKey } from "$misc/shared";
	import { isLoadingAnswerStore, liveAnswerStore, settingsStore, speechBlobStore, speechBlocksStore } from "$misc/stores";
	import { onMount } from "svelte";
	import type { Unsubscriber } from "svelte/store";

    let lastBlock: string | undefined = undefined;
    let isSpeaking = false;
    let currentBlockFragmentIndex: number = 0;
    let isSkippingCodeBlock = false;
    let liveAnswerStoreUnsubscriber: Unsubscriber;
    let isLoadingAnswerStoreUnsubscriber: Unsubscriber;
    let timerId: any;

    onMount(() => {
        liveAnswerStoreUnsubscriber = liveAnswerStore.subscribe((currentLiveAnswer) => {
            const content = currentLiveAnswer.content;
            if (content) {
                const newBlocks = getSpeechBlocksFromFragment(content);
                // Push all blocks except last block (which is incomplete)
                for (let i=0; i < newBlocks.length - 1; i++) {
                    const newBlock = newBlocks[i];
                    if (newBlock) {
                        const normalizedBlock = normalizeBlock(newBlock);
                        if (normalizedBlock === '```') {
                            isSkippingCodeBlock = false;
                            continue;
                        } else if (normalizedBlock.startsWith('```')) {
                            isSkippingCodeBlock = true;
                        }

                        if (!isSkippingCodeBlock) {
                            // console.log('Adding block', newBlock);
                            pushBlockToQueue(newBlock);
                        }
                    }

                    // Increment block index by length of current block + 1 (for the delimiter character)
                    currentBlockFragmentIndex += newBlock.length + 1; 
                }

                lastBlock = newBlocks.length > 0 ? newBlocks[newBlocks.length-1] : undefined;
            } else {
                reset();
            }
        });

        isLoadingAnswerStoreUnsubscriber = isLoadingAnswerStore.subscribe(isLoading => {
            if (!isLoading) {
                // Push the last block now that we know it is complete.
                if (lastBlock) {
                    // console.log('Adding last block', lastBlock);
                    pushBlockToQueue(lastBlock);
                }
            }
        });

        startTimer();

        return (() => {
            stopTimer();
            liveAnswerStoreUnsubscriber();
            isLoadingAnswerStoreUnsubscriber();
        })
    });

    function startTimer() {
        timerId = setInterval(async () => {
            await checkForNewMessages();
        });
    }

    function stopTimer() {
        if (timerId) {
            clearInterval(timerId);
            timerId = null;
        }
    }

    function reset() {
        lastBlock = undefined;
        currentBlockFragmentIndex = 0;
        isSkippingCodeBlock = false;
    }

    function pushBlockToQueue(newBlock: string) {
        const normalizedBlock = normalizeBlock(newBlock);
        if (!normalizedBlock) {
            return;
        }

        // console.log('Queuing block', normalizedBlock);
        speechBlocksStore.update(store =>  [...store, { text: normalizedBlock }] );

        // Load the audio and cache
        setTimeout(async () => {
            // console.log('Async loading audio', normalizedBlock);
            const blob = await loadAudioBlob(normalizedBlock) || undefined;
            if (blob) {
                speechBlobStore.update(current => {
                    // Clone the current record and add the new key-value pair
                    const newRecord = { ...current, [normalizedBlock]: blob };
                    return newRecord;
                });
            }
        }, 10);
    }

    function popBlockFromQueue() {
        if ($speechBlocksStore.length === 0) {
            return undefined;
        }

        const firstElement = $speechBlocksStore[0];
        speechBlocksStore.update(store =>  store.slice(1));

        return firstElement;
    }

    function getSpeechBlocksFromFragment(fullFragment: string|null): string[] {
		if (!fullFragment) {
			return [];
		}

        const currentFragment = fullFragment.substring(currentBlockFragmentIndex);

		// Split by punctuation
		let blocks = currentFragment.split(/[⁣\n]/g);
        return blocks;
	}

    function normalizeBlock(s: string) {
        if (!s) {
            return '';
        }

        s = s.trim();
		
        return s;
    }

    async function checkForNewMessages() {
        if (isSpeaking) {
            return;
        }

        const block = popBlockFromQueue();
        if (block) {
            // console.log('Speak', block.text);
            try { 
                await speakMessage(block.text);
            } catch(error) {
                console.error(error);
                isSpeaking = false;
            }
        }

        window.requestAnimationFrame(checkForNewMessages);
    }

    function isUsingOpenAi() {
        return useSsrOpenAiKey() || $settingsStore.openAiApiKey;
    }

    async function speakMessage(message: string) {
        if (isUsingOpenAi()) {
            return speakMessageOpenAi(message);
        }

        return speakMessageNative(message);
    }

    async function speakMessageNative(message: string) {
        return new Promise((resolve, reject) => {
            const utterance = new SpeechSynthesisUtterance(message);
            utterance.onend = resolve;
            utterance.onerror = reject;
            isSpeaking = true;
            speechSynthesis.speak(utterance);
            isSpeaking = false;
        });
    }
    
    async function loadAudioBlob(message: string): Promise<Blob | null> {
        try {
            const response = await fetch('/api/speak', {
                method: 'POST',
                body: JSON.stringify({ apiKey: $settingsStore.openAiApiKey, message })
            });

            if (!response.body) {
                return null;
            }

            const blob = await response.blob();
		    return blob;
        } catch(err) {
            console.error(err);
        }
        return null;
    }

    async function speakMessageOpenAi(message: string) {
        isSpeaking = true;
        
        let blob: Blob | null = $speechBlobStore[message];
        
        if (blob) {
            // console.log('Using pre-loaded blob');
        } else {
            // console.log('No blob. Retrying in 100ms.');
            setTimeout(() => {
                speakMessageOpenAi(message);
            }, 100);
            return;
        }
        
		const url = URL.createObjectURL(blob);
        const audio = new Audio();
		audio.src = url;
        
		return new Promise(async (resolve, reject) => {
            function onAudioEnd() {
                isSpeaking = false;
                audio.removeEventListener('ended', onAudioEnd);
                resolve(true);
            }
            audio.addEventListener('ended', onAudioEnd);
            await audio.play();
        });
    }
</script>