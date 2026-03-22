(function initRegistry(global) {
  const adapters = [];

  function register(adapter) {
    adapters.push(adapter);
  }

  function getActiveAdapter(locationObj) {
    for (const adapter of adapters) {
      try {
        if (adapter.match(locationObj)) {
          return adapter;
        }
      } catch (err) {
        console.warn("ChatBranch adapter match error", err);
      }
    }
    return null;
  }

  global.ChatBranchAdapters = {
    register,
    getActiveAdapter
  };
})(window);
