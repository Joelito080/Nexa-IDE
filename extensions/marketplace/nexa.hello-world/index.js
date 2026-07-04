module.exports = {
  activate(context) {
    if (context && typeof context.log === 'function') {
      context.log('Nexa Hello World extension activated.')
    }
    context.registerCommand?.({ id: 'nexa.helloWorld.sayHello', title: 'Say Hello from Nexa' }, async () => {
      context.log('Hello from Nexa Hello World extension!')
      return { success: true }
    })
  },
  deactivate() {
    // no-op cleanup for sample extension
  }
}
