const Download = {
  url: async function(url, name) {
      name = name ?? "";
      var a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
  },
  blob: async function (blob, name) {
    this.url(window.URL.createObjectURL(blob), name);
  },
  binary: async function (uintArr, name) {
    this.blob(new Blob([uintArr], {type:"application/octet-stream"}), name);
  },
  text: async function (text, name) {
    this.blob(new Blob([text], {type:"text/plain"}), name);
  },
};
