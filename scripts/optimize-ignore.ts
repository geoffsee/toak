export async function optimizeToakIgnore(content: string) {
  const inferenceProcess = Bun.spawn(['bun', 'run:inference']);

  await new Promise(resolve => setTimeout(resolve, 5000));

  const prompt = `You are a helpful assistant.
## Context
~~~
${content}
~~~
Respond with a list of files that should be added to the .toak-ignore file to reduce noise in the context. No extra text or explanations.`;

  async function run() {
    try {
      const response = await fetch('http://127.0.0.1:8080/completion', {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          n_predict: 512,
        }),
      });
      const data = await response.json();
      console.log(data.content);
    } catch (error) {
      console.error('Error:', error);
    }
  }
  await run();
  inferenceProcess.kill();
}