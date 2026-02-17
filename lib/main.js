const { CompositeDisposable, Disposable } = require("atom");

module.exports = {
  activate() {
    this.disposables = new CompositeDisposable(
      atom.config.observe("scrollmap-search-panel.threshold", (value) => {
        this.threshold = value;
      }),
      atom.config.observe("scrollmap-search-panel.permanent", (value) => {
        this.permanent = value;
      }),
    );
    this.service = null;
  },

  deactivate() {
    this.service = null;
    this.disposables.dispose();
  },

  consumeSearchPanel(service) {
    this.service = service;
    const updateAll = throttle(() => {
      for (const editor of atom.workspace.getTextEditors()) {
        const layer = editor.scrollmap?.layers.get("find");
        if (!layer) continue;
        let markers = [];
        if (this.permanent || this.service.isFindVisible()) {
          const markerLayer = this.service.resultsMarkerLayerForTextEditor(editor);
          if (markerLayer) {
            markers = markerLayer.getMarkers();
          }
        }
        layer.cache.set("data", markers);
        layer.update();
      }
    }, 50);
    const subscriptions = new CompositeDisposable();
    subscriptions.add(this.service.onDidUpdate(updateAll));
    subscriptions.add(this.service.onDidChangeFindVisibility(updateAll));
    return new Disposable(() => {
      this.service = null;
      subscriptions.dispose();
    });
  },

  provideScrollmap() {
    return {
      name: "find",
      description: "Search panel result markers",
      initialize: ({ disposables, update }) => {
        disposables.add(
          atom.config.onDidChange("scrollmap-search-panel.permanent", update),
          atom.config.onDidChange("scrollmap-search-panel.threshold", update),
        );
      },
      getItems: ({ cache }) => {
        const items = (cache.get("data") || []).map((marker) => ({
          row: marker.getScreenRange().start.row,
        }));
        if (this.threshold && items.length > this.threshold) {
          return [];
        }
        return items;
      },
    };
  },
};

function throttle(func, timeout) {
  let timer = null;
  return (...args) => {
    if (timer) {
      return;
    }
    timer = setTimeout(() => {
      func.apply(this, args);
      timer = null;
    }, timeout);
  };
}
