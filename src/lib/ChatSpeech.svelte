<script lang="ts">
	import { isLoadingAnswerStore, liveAnswerStore } from "$misc/stores";
	import { onMount } from "svelte";

    let speechBlocks: string[] = [];
    let lastBlock: string | undefined = undefined;
    let isSpeaking = false;
    let currentBlockFragmentIndex: number = 0;
    let isSkippingCodeBlock = false;

    onMount(() => {
        liveAnswerStore.subscribe((currentLiveAnswer) => {
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

        isLoadingAnswerStore.subscribe(isLoading => {
            if (!isLoading) {
                // Push the last block now that we know it is complete.
                if (lastBlock) {
                    // console.log('Adding last block', lastBlock);
                    pushBlockToQueue(lastBlock);
                }
            }
        });

        checkForNewMessages();
    });

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

        // console.log('Adding new block', normalizedBlock);
        speechBlocks.push(normalizedBlock);
    }

    function popBlockFromQueue() {
        return speechBlocks.shift();
    }

    function getSpeechBlocksFromFragment(fullFragment: string|null): string[] {
		if (!fullFragment) {
			return [];
		}

        const currentFragment = fullFragment.substring(currentBlockFragmentIndex);

		// Split by punctuation
		let blocks = currentFragment.split(/[⁣?!;:\n]/g);
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
            // console.log('Speak', block);
            try { 
                await speakMessage(block);
            } catch(error) {
                console.error(error);
            } finally {
                isSpeaking = false;
                
            }
        }

        window.requestAnimationFrame(checkForNewMessages);
    }

    async function speakMessage(message: string) {
        return new Promise((resolve, reject) => {
            const utterance = new SpeechSynthesisUtterance(message);
            utterance.onend = resolve;
            utterance.onerror = reject;
            speechSynthesis.speak(utterance);
            isSpeaking = true;
        });
    }
</script>