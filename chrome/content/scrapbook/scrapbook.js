
var sbMainService = {

    baseURL: "",
    prefs: {},


    init: function() {
        sbTreeHandler.init(false);
        this.baseURL = sbCommonUtils.getBaseHref(sbDataSource.data.URI);
        sbSearchService.init();
        setTimeout(function() { sbMainService.delayedInit(); }, 0);
    },

    delayedInit: function() {
        if ("sbBrowserOverlay" in window.top == false) return;
        sbMultiBookService.showSidebarTitle();
        if (window.top.sbBrowserOverlay.locateMe)
            this.locate(null);
        if (!document.getElementById("sbAddOnsPopup").firstChild)
            document.getElementById("sbAddOns").hidden = true;
    },

    rebuild: function() {
        sbTreeHandler.TREE.builder.rebuild();
    },

    refresh: function() {
        sbTreeHandler.uninit();
        sbMultiBookService.file = null;  // force sbMultiBookService.initMenu to run initFile when called
        this.init();
    },

    done: function() {
        sbNoteService.save();
    },


    toggleHeader: function(aWillShow, aLabel) {
        document.getElementById("sbHeader").hidden = !aWillShow;
        document.getElementById("sbHeader").firstChild.value = aLabel;
    },

    trace: function(aText, aMillisec) {
        var win = top.window;
        var status = win.document.getElementById("statusbar-display");
        if ( !status ) return;
        status.label = aText;
        if (status.timeout) win.clearTimeout(status.timeout);  // clear previous timeout
        status.timeout = win.setTimeout(function() {
            status.label = "";
            status.timeout = null;
        }, aMillisec || 5000);
    },

    locate: function(aRes) {
        if (!aRes)
            aRes = window.top.sbBrowserOverlay.locateMe;
        if ("sbBrowserOverlay" in window.top)
            window.top.sbBrowserOverlay.locateMe = null;
        if (aRes.Value == "urn:scrapbook:root")
            return;
        sbSearchService.exit();
        sbTreeHandler.locateInternal(aRes);
    },

    createFolder: function(aAsChild) {
        sbSearchService.exit();
        // create item
        var newItem = sbCommonUtils.newItem(sbCommonUtils.getTimeStamp());
        newItem.id = sbDataSource.identify(newItem.id);
        newItem.title = sbCommonUtils.lang("DEFAULT_FOLDER");
        newItem.type = "folder";
        // add resource
        var newRes = this.addNewResource(newItem, null, aAsChild);
        // edit the new folder
        var result = {};
        window.openDialog(
            "chrome://scrapbook/content/property.xul", "", "modal,centerscreen,chrome",
            newItem.id, result
        );
        var idx = sbTreeHandler.TREE.builderView.getIndexOfResource(newRes);
        if (!result.accept) {
            sbDataSource.deleteItemDescending(newRes, sbTreeHandler.getParentResource(idx));
            return false;
        }
        sbTreeHandler.TREE.view.selection.select(idx);
        return true;
    },

    createSeparator: function(aAsChild) {
        sbSearchService.exit();
        // create item
        var newItem = sbCommonUtils.newItem(sbCommonUtils.getTimeStamp());
        newItem.id = sbDataSource.identify(newItem.id);
        newItem.type = "separator";
        // add resource
        var newRes = this.addNewResource(newItem, null, aAsChild);
    },

    createNote: function(aAsChild, aInTab) {
        sbSearchService.exit();
        // add resource
        var newRes = this.addNewResource(null, {"type": "note", "inTab": aInTab}, aAsChild);
    },

    createNoteX: function(aAsChild) {
        sbSearchService.exit();
        // create item
        var newItem = sbCommonUtils.newItem(sbCommonUtils.getTimeStamp());
        newItem.id = sbDataSource.identify(newItem.id);
        newItem.title = sbCommonUtils.lang("DEFAULT_NOTEX");
        newItem.type = "notex";
        newItem.chars = "UTF-8";
        // check the template file, create one if not exist
        var template = sbCommonUtils.getScrapBookDir().clone();
        template.append("notex_template.html");
        if ( !template.exists() ) sbCommonUtils.saveTemplateFile("chrome://scrapbook/skin/notex_template.html", template);
        // create content
        var dir = sbCommonUtils.getContentDir(newItem.id);
        var html = dir.clone();
        html.append("index.html");
        var tpl = {
            NOTE_TITLE: newItem.title,
            SCRAPBOOK_DIR: "../..",
            DATA_DIR: ".",
        };
        var content = sbCommonUtils.readFile(template, "UTF-8");
        content = content.replace(/<%([\w_]+)%>/g, function(){
            var label = arguments[1];
            if (tpl[label]) return tpl[label];
            return "";
        });
        sbCommonUtils.writeFile(html, content, newItem.chars);
        sbCommonUtils.writeIndexDat(newItem);
        // add resource
        var newRes = this.addNewResource(newItem, null, aAsChild);
        // open and edit the new notex
        sbController.open(newRes, false);
    },

    addNewResource: function(aItem, aData, aAsChild) {
        // calculate the position to insert
        var tarResName, tarRelIdx, isRootPos;
        try {
            var curIdx = sbTreeHandler.TREE.view.selection.count ? sbTreeHandler.TREE.currentIndex : -1;
            var curRes = sbTreeHandler.TREE.builderView.getResourceAtIndex(curIdx);
            if (aAsChild && sbDataSource.isContainer(curRes)) {
                tarResName = curRes.Value;
                tarRelIdx = 0;
                isRootPos = false;
                if (!sbTreeHandler.TREE.view.isContainerOpen(curIdx) ) sbTreeHandler.TREE.view.toggleOpenState(curIdx);
            } else {
                var curPar = sbTreeHandler.getParentResource(curIdx);
                var curRelIdx = sbDataSource.getRelativeIndex(curPar, curRes);
                tarResName = curPar.Value;
                tarRelIdx = curRelIdx + (sbCommonUtils.getPref("tree.unshift", false) ? 0 : 1);
                isRootPos = false;
            }
        } catch(ex) {
            tarResName = sbTreeHandler.TREE.ref;
            tarRelIdx = 0;
            isRootPos = true;
        }
        // add the new resource
        if (aItem) {
            var newRes = sbDataSource.addItem(aItem, tarResName, tarRelIdx);
            if (aItem.type == "folder") sbDataSource.createEmptySeq(newRes.Value);
        } else {
            if (!aData) return;
            if (aData.type == "note") {
                sbNoteService.create(tarResName, tarRelIdx, aData.inTab);
                var newRes = sbNoteService.resource;
            }
        }
        sbCommonUtils.rebuildGlobal();
        // select and scroll to the new resource
        var idx = sbTreeHandler.TREE.builderView.getIndexOfResource(newRes);
        sbTreeHandler.TREE.view.selection.select(idx);
        sbTreeHandler.TREE.treeBoxObject.ensureRowIsVisible(idx);
        return newRes;
    },

    makeContainer: function() {
        try {
            var curIdx = sbTreeHandler.TREE.view.selection.count ? sbTreeHandler.TREE.currentIndex : -1;
            var curRes = sbTreeHandler.TREE.builderView.getResourceAtIndex(curIdx);
            if (!sbDataSource.isContainer(curRes)) {
                sbDataSource.createEmptySeq(curRes.Value);
            }
        } catch (ex) {
            sbCommonUtils.alert(sbCommonUtils.lang("ERR_FAIL_MAKE_CONTAINER", ex));
        }
    },

    unmakeContainer: function() {
        try {
            var curIdx = sbTreeHandler.TREE.view.selection.count ? sbTreeHandler.TREE.currentIndex : -1;
            var curRes = sbTreeHandler.TREE.builderView.getResourceAtIndex(curIdx);
            if (sbDataSource.isContainer(curRes)) {
                if (sbDataSource.flattenResources(curRes, 0, false).length <= 1) {
                    var curPar = sbTreeHandler.getParentResource(curIdx);
                    var curRelIdx = sbDataSource.getRelativeIndex(curPar, curRes);
                    var item = sbDataSource.getItem(curRes);
                    sbDataSource.deleteItemDescending(curRes, curPar);
                    sbDataSource.addItem(item, curPar.Value, curRelIdx);
                    sbCommonUtils.rebuildGlobal();
                } else {
                    sbCommonUtils.alert(sbCommonUtils.lang("ERR_FAIL_UNMAKE_CONTAINER_NONEMPTY"));
                }
            }
        } catch (ex) {
            sbCommonUtils.alert(sbCommonUtils.lang("ERR_FAIL_UNMAKE_CONTAINER", ex));
        }
    },

    openPrefWindow: function() {
        var instantApply = sbCommonUtils.getPref("browser.preferences.instantApply", false, true);
        window.top.openDialog(
            "chrome://scrapbook/content/prefs.xul", "ScrapBook:Options",
            "chrome,titlebar,toolbar,centerscreen,resizable," + (instantApply ? "dialog=no" : "modal")
        );
    },

};




var sbController = {

    // left for addon compatibility
    isTreeContext: function(itcEvent) {
        return true;
    },

    onPopupShowing: function(aEvent) {
        if (aEvent.originalTarget.localName != "menupopup") return;
        var res = sbTreeHandler.resource;
        if (!res) {
            aEvent.preventDefault();
            return;
        }
        var isContainer = false;
        var isFile = false;
        var isNote = false;
        var isNotex = false;
        var isFolder = false;
        var isBookmark = false;
        var isSeparator = false;
        var isMultiple = ( sbTreeHandler.TREE.view.selection.count > 1 );
        if (!isMultiple) {
            isContainer = sbDataSource.isContainer(res);
            switch (sbDataSource.getProperty(res, "type")) {
                case "file": isFile = true; break;
                case "note": isNote = true; break;
                case "notex": isNotex = true; break;
                case "folder": isFolder = true; break;
                case "bookmark": isBookmark = true; break;
                case "separator": isSeparator = true; break;
            }
        }
        var getElement = function(aID) {
            return document.getElementById(aID);
        };
        getElement("sbPopupOpenNative").hidden = isMultiple || !isFile;
        getElement("sbPopupOpen").hidden = isMultiple || isFolder || isSeparator;
        getElement("sbPopupOpenNewTab").hidden = isMultiple || isFolder || isSeparator;
        getElement("sbPopupOpenSource").hidden = isMultiple || isFolder || isSeparator || isNote;
        getElement("sbPopupCombinedView").hidden = isMultiple || !isContainer;
        getElement("sbPopupOpenAllItems").hidden = isMultiple || !isContainer;
        getElement("sbPopupOpenAllItems").nextSibling.hidden = isMultiple || !isContainer;
        getElement("sbPopupManage").hidden = isMultiple || !isContainer;
        getElement("sbPopupSort").hidden = isMultiple || !isContainer;
        getElement("sbPopupMakeContainer").hidden = isMultiple || isContainer || isSeparator;
        getElement("sbPopupUnmakeContainer").hidden = isMultiple || !isContainer || isFolder;
        getElement("sbPopupNewFolder").hidden = isMultiple;
        getElement("sbPopupNewSeparator").hidden = isMultiple;
        getElement("sbPopupNewNote").hidden = isMultiple;
        getElement("sbPopupNewNotex").hidden = isMultiple;
        getElement("sbPopupNewNotex").nextSibling.hidden = isMultiple;
        getElement("sbPopupProperty").previousSibling.hidden = isMultiple;
        getElement("sbPopupProperty").hidden = isMultiple;
        // tools submenu
        getElement("sbPopupShowFiles").disabled = isMultiple || isFolder || isSeparator || isBookmark;
        getElement("sbPopupCopy").disabled = isMultiple || isFolder;
        getElement("sbPopupRenew").disabled = isMultiple || isFolder || isSeparator || isNote || isNotex;
        getElement("sbPopupInternalize").hidden = isMultiple || !isNotex;
        getElement("sbPopupExport").previousSibling.hidden = isMultiple || isFolder;
        getElement("sbPopupExport").hidden = isMultiple || isFolder;
    },

    open: function(aRes, aInTab) {
        if (!aRes)
            aRes = sbTreeHandler.resource;
        if (!aRes)
            return;
        var id = sbDataSource.getProperty(aRes, "id");
        if (!id)
            return;
        switch (sbDataSource.getProperty(aRes, "type")) {
            case "note":
                sbNoteService.open(aRes, aInTab || sbCommonUtils.getPref("tabs.note", false));
                break;
            case "bookmark":
                sbCommonUtils.loadURL(
                    sbDataSource.getProperty(aRes, "source"),
                    aInTab || sbCommonUtils.getPref("tabs.open", false)
                );
                break;
            case "separator": 
                return;
            case "notex":
                sbCommonUtils.loadURL(
                    sbMainService.baseURL + "data/" + id + "/index.html",
                    aInTab || sbCommonUtils.getPref("tabs.note", false)
                );
                break;
            default:
                sbCommonUtils.loadURL(
                    sbMainService.baseURL + "data/" + id + "/index.html",
                    aInTab || sbCommonUtils.getPref("tabs.open", false)
                );
        }
    },

    openAllInTabs: function(aRes) {
        if (!aRes)
            aRes = sbTreeHandler.resource;
        if (!aRes)
            return;
        sbDataSource.flattenResources(aRes, 0, false).forEach(function(res) {
            switch (sbDataSource.getProperty(res, "type")) {
                case "folder":
                case "separator":
                    break;
                default:
                    sbCommonUtils.loadURL(sbDataSource.getURL(res), true);
            }
        });
    },

    renew: function(aRes, aShowDetail) {
        if (!aRes)
            aRes = sbTreeHandler.resource;
        if (!aRes)
            return;
        var preset = [
            sbDataSource.getProperty(aRes, "id"),
            "index",
            null,
            null,
            0,
            sbDataSource.getProperty(aRes, "type") == "bookmark"
        ];
        var data = {
            urls: [sbDataSource.getProperty(aRes, "source")],
            showDetail: aShowDetail,
            preset: preset,
            context: "capture-again",
        };
        window.top.openDialog("chrome://scrapbook/content/capture.xul", "", "chrome,centerscreen,all,resizable,dialog=no", data);
    },

    internalize: function(aRes) {
        if (!aRes)
            aRes = sbTreeHandler.resource;
        if (!aRes)
            return;
        var id = sbDataSource.getProperty(aRes, "id");
        var refFile = sbCommonUtils.getContentDir(id); refFile.append("index.html");
        var refDir = refFile.parent;

        // pre-fill files in the same folder to prevent overwrite
        var file2Url = {};
        sbCommonUtils.forEachFile(refDir, function(file){
            if (file.isDirectory() && file.equals(refDir)) return;
            file2Url[file.leafName] = true;
            return 0;
        }, this);

        var options = {
            "isPartial": false,
            "images": true,
            "media": true,
            "styles": true,
            "script": true,
            "fileAsHtml": false,
            "forceUtf8": false,
            "tidyCss": false,
            "internalize": refFile,
        };
        var preset = [
            id,
            "index",
            options,
            file2Url,
            0,
            false
        ];
        var data = {
            urls: [sbMainService.baseURL + "data/" + id + "/index.html"],
            showDetail: false,
            option: options,
            file2Url: file2Url,
            preset: preset,
            titles: [sbDataSource.getProperty(aRes, "title")],
            context: "internalize",
        };
        window.top.openDialog("chrome://scrapbook/content/capture.xul", "", "chrome,centerscreen,all,resizable,dialog=no", data);
    },

    forward: function(aRes, aCommand, aParam) {
        if (!aRes)
            aRes = sbTreeHandler.resource;
        if (!aRes)
            return;
        var id = sbDataSource.getProperty(aRes, "id");
        if (!id)
            return;
        switch (aCommand) {
            case "P": 
                window.openDialog("chrome://scrapbook/content/property.xul", "", "chrome,centerscreen,modal", id);
                break;
            case "M": 
                sbCommonUtils.openManageWindow(aRes, null);
                break;
            case "Z": 
                window.openDialog('chrome://scrapbook/content/sort.xul','','chrome,centerscreen,modal', aRes);
                break;
            case "C": 
                sbCommonUtils.loadURL(
                    "chrome://scrapbook/content/view.xul?id=" + sbDataSource.getProperty(aRes, "id"),
                    sbCommonUtils.getPref("tabs.combinedView", false)
                );
                break;
            case "S": 
                sbCommonUtils.loadURL(
                    sbDataSource.getProperty(aRes, "source"),
                    sbCommonUtils.getPref("tabs.openSource", false) || aParam
                );
                break;
            case "N": 
                var index = sbCommonUtils.getContentDir(id); index.append("index.html");
                var redirectFile = sbCommonUtils.readMetaRefresh(index);
                if (redirectFile) {
                    this.launch(redirectFile);
                }
                break;
            case "L": 
                this.launch(sbCommonUtils.getContentDir(id));
                break;
            case "E": 
                window.openDialog(
                    "chrome://scrapbook/content/trade.xul", "",
                    "chrome,centerscreen,all,resizable,dialog=no",
                    aRes
                );
                break;
        }
    },

    launch: function(aFile) {
        try {
            aFile = aFile.QueryInterface(Components.interfaces.nsILocalFile);
            aFile.launch();
        } catch(ex) {
            console.log(ex);
        }
    },

    sendInternal: function(aResList, aParResList) {
        var result = {};
        var preset = aParResList[0];
        window.openDialog(
            "chrome://scrapbook/content/folderPicker.xul", "",
            "modal,chrome,centerscreen,resizable=yes", result, preset
        );
        if (!result.resource)
            return;
        var tarRes = result.resource;
        for (var i = 0; i < aResList.length; i++)  {
            sbDataSource.moveItem(aResList[i], aParResList[i], tarRes, -1);
        }
        sbCommonUtils.rebuildGlobal();
    },

    copyInternal: function(aResList, aParResList) {
        var result = {};
        var preset = aParResList[0];
        window.openDialog(
            "chrome://scrapbook/content/folderPicker.xul", "",
            "modal,chrome,centerscreen,resizable=yes", result, preset
        );
        if (!result.resource)
            return;
        var tarRes = result.resource;
        for (var i = 0; i < aResList.length; i++)  {
            sbDataSource.copyItem(aResList[i], tarRes, -1);
        }
        sbCommonUtils.rebuildGlobal();
    },

    removeInternal: function(aResList, aParResList, aBypassConfirm) {
        var rmIDs = [];
        for (var i = 0, I = aResList.length; i < I; i++) {
            if (aParResList[i].Value == "urn:scrapbook:search") {
                aParResList[i] = sbDataSource.findParentResource(aResList[i]);
                if (!aParResList[i])
                    continue;
                sbDataSource.removeFromContainer("urn:scrapbook:search", aResList[i]);
            }
            if (!sbDataSource.exists(aResList[i])) {
                continue;
            } else if (sbDataSource.getRelativeIndex(aParResList[i], aResList[i]) < 0) {
                sbCommonUtils.alert(sbCommonUtils.lang("ERR_FAIL_REMOVE_RESOURCE", aResList[i].Value));
                continue;
            }
            sbDataSource.deleteItemDescending(aResList[i], aParResList[i], rmIDs);
        }
        for (var i = 0; i < rmIDs.length; i++) {
            var myDir = sbCommonUtils.getContentDir(rmIDs[i], true);
            if (myDir) sbCommonUtils.removeDirSafety(myDir, false);
        }
        return rmIDs;
    },

    confirmRemovingFor: function(aResList) {
        if (sbCommonUtils.getPref("confirmDelete", false)) {
            return this.confirmRemovingPrompt();
        }
        for ( var i = 0; i < aResList.length; i++ ) {
            if ( sbDataSource.isContainer(aResList[i]) ) {
                return this.confirmRemovingPrompt();
            }
        }
        return true;
    },

    confirmRemovingPrompt: function() {
        var button = sbCommonUtils.PROMPT.STD_YES_NO_BUTTONS + sbCommonUtils.PROMPT.BUTTON_POS_1_DEFAULT;
        var text = sbCommonUtils.lang("CONFIRM_DELETE");
        // pressing default button or closing the prompt returns 1
        // reverse it to mean "no" by default
        return !sbCommonUtils.PROMPT.confirmEx(null, "[ScrapBook]", text, button, null, null, null, null, {});
    },

};



var sbSearchService = {

    get ELEMENT() { return document.getElementById("sbSearchImage"); },
    get FORM_HISTORY() {
        try {
            // Firefox >= ?
            Components.utils.import("resource://gre/modules/FormHistory.jsm");
            var result = FormHistory;
        } catch (ex) {
            // not available in Firefox >= 54
            var result = Components.classes["@mozilla.org/satchel/form-history;1"]
                    .getService(Components.interfaces.nsIFormHistory2 || Components.interfaces.nsIFormHistory);
        }
        return this.FORM_HISTORY = result;
    },

    type: "",
    container: null,
    treeRef: "urn:scrapbook:root",

    init: function() {
        this.type = this.ELEMENT.getAttribute("searchtype");
        if (["fulltext","title","comment","source","id","all"].indexOf(this.type) < 0)
            this.type = "fulltext";
        this.ELEMENT.src = "chrome://scrapbook/skin/search_" + this.type + ".png";
        this.exit();
    },

    change: function(aType) {
        this.ELEMENT.setAttribute("searchtype", aType);
        this.init();
    },

    populatePopup: function() {
        var c = this.type.charAt(0).toUpperCase();
        ["F", "T", "C", "S", "I", "A"].forEach(function(elt) {
            document.getElementById("sbSearchPopup" + elt).setAttribute("checked", elt == c);
        });
    },

    enter: function(aInput) {
        if (aInput.match(/^[a-z]$/i) || !aInput) {
            var table = {
                "F": "fulltext",
                "T": "title",
                "C": "comment",
                "U": "source",
                "I": "id",
                "A": "all"
            };
            if (aInput.toUpperCase() in table) {
                this.change(table[aInput.toUpperCase()]);
            } else {
                this.exit();
            }
            document.getElementById("sbSearchTextbox").value = "";
        } else {
            var query = aInput;
            var re = document.getElementById("sbSearchPopupOptionRE").getAttribute("checked");
            var mc = document.getElementById("sbSearchPopupOptionCS").getAttribute("checked");
            this.addFormHistory(query);
            if (this.type == "fulltext") {
                this.doFullTextSearch(query, re, mc);
            } else {
                var key = sbSearchQueryHandler.parse(query, {'re': re, 'mc': mc, 'default': this.type});
                this.doFilteringSearch(key);
            }
        }
    },

    doFullTextSearch: function(query, re, mc) {
        var cache = sbCommonUtils.getScrapBookDir().clone();
        cache.append("cache.rdf");
        var shouldBuild = false;
        if (!cache.exists() || cache.fileSize < 1024 * 32) {
            shouldBuild = true;
        } else {
            var data = sbCommonUtils.getScrapBookDir().clone();
            data.append("scrapbook.rdf");
            var dataModTime = data.lastModifiedTime;
            var cacheModTime = cache.lastModifiedTime;
            if (dataModTime > cacheModTime && ((new Date()).getTime() - cacheModTime) > 1000 * 60 * 60 * 24 * 5)
                shouldBuild = true;
        }
        var uri = "chrome://scrapbook/content/result.xul";
        var query = "?q=" + encodeURIComponent(query) 
            + (re ? "&re=1" : "")
            + (mc ? "&cs=1" : "")
            + (this.treeRef != "urn:scrapbook:root" ? "&ref=" + this.treeRef : "");
        if (shouldBuild) {
            this.updateCache(uri + query);
        } else {
            var win = sbCommonUtils.getBrowserWindow();
            var inTab = (win.content.location.href.startsWith(uri)) ? false : sbCommonUtils.getPref("tabs.searchResult", false);
            sbCommonUtils.loadURL(uri + query, inTab);
            win.focus();
        }
    },

    updateCache: function(aResURI) {
        window.openDialog('chrome://scrapbook/content/cache.xul','ScrapBook:Cache','chrome,dialog=no', aResURI);
    },

    doFilteringSearch: function(aKey) {
        if (aKey.error.length) {
            this.showErrorMessage(aKey.error[0]);
            return;
        }
        sbDataSource.clearContainer("urn:scrapbook:search");
        this.container = sbDataSource.getContainer("urn:scrapbook:search", true);
        var resList = sbDataSource.flattenResources(sbCommonUtils.RDF.GetResource(this.treeRef), 0, true);
        resList.shift(); // remove root
        var result = [];
        resList.forEach(function(res) {
            if (sbDataSource.getProperty(res, "type") !== "folder") {
                if (sbSearchQueryHandler.match(aKey, res, false)) result.push(res);
            }
        }, this);
        aKey.sort.forEach(function(sortKey){
            result.sort(function(a, b){
                a = sbDataSource.getProperty(a, sortKey[0]);
                b = sbDataSource.getProperty(b, sortKey[0]);
                if (a > b) return sortKey[1];
                if (a < b) return -sortKey[1];
                return 0;
            });
        }, this);
        result.forEach(function(res){
            this.container.AppendElement(res);
        }, this);
        sbTreeHandler.TREE.ref = "urn:scrapbook:search";
        sbTreeHandler.TREE.builder.rebuild();
        sbTreeHandler.enableDragDrop(false);
        sbMainService.toggleHeader(
            true,
            sbCommonUtils.lang("SEARCH_RESULTS_FOUND", this.container.GetCount())
        );
    },

    showErrorMessage: function(aStr) {
        sbTreeHandler.TREE.ref = "urn:scrapbook:search";
        sbTreeHandler.TREE.builder.rebuild();
        sbTreeHandler.enableDragDrop(false);
        sbMainService.toggleHeader(true, aStr);
    },

    listView: function() {
        if (sbTreeHandler.TREE.ref == "urn:scrapbook:search") {
            this.exit();
            return;
        }
        sbDataSource.clearContainer("urn:scrapbook:search");
        this.container = sbDataSource.getContainer("urn:scrapbook:search", true);
        var resList = sbDataSource.flattenResources(sbCommonUtils.RDF.GetResource(this.treeRef), 0, true);
        resList.shift(); // remove root
        resList.forEach(function(res) {
            if (sbDataSource.getProperty(res, "type") !== "folder") {
                this.container.AppendElement(res);
            }
        }, this);
        sbTreeHandler.TREE.ref = "urn:scrapbook:search";
        sbTreeHandler.TREE.builder.rebuild();
        sbTreeHandler.enableDragDrop(false);
        sbMainService.toggleHeader(
            true,
            sbCommonUtils.lang("SEARCH_RESULTS_FOUND", this.container.GetCount())
        );
    },

    exit: function() {
        if (sbTreeHandler.TREE.ref != "urn:scrapbook:search")
            return;
        sbMainService.toggleHeader(false, "");
        document.getElementById("sbSearchTextbox").value = "";
        sbTreeHandler.TREE.ref = this.treeRef;
        sbTreeHandler.TREE.builder.rebuild();
        sbTreeHandler.enableDragDrop(false);
        sbTreeHandler.enableDragDrop(true);
        sbDataSource.clearContainer("urn:scrapbook:search");
    },

    addFormHistory: function(query) {
        if (this.FORM_HISTORY.update) {
            this.FORM_HISTORY.update({
                op: "remove",
                fieldname: "sbSearchHistory",
                value: query
            });
            this.FORM_HISTORY.update({
                op: "add",
                fieldname: "sbSearchHistory",
                value: query
            });
        } else {
            this.FORM_HISTORY.addEntry("sbSearchHistory", query);
        }
    },

    clearFormHistory: function() {
        if (this.FORM_HISTORY.update) {
            this.FORM_HISTORY.update({
                op: "remove",
                fieldname: "sbSearchHistory"
            });
        } else {
            this.FORM_HISTORY.removeEntriesForName("sbSearchHistory");
        }
    },
};




var sbSearchQueryHandler = {

    hits: null,

    // parses a given search query string
    parse: function(aString, aPreset) {
        var that = this;
        aPreset = aPreset || [];
        var key = {
            'rule': [],
            'error': [],
            'sort': [],
            'mc': !!aPreset['mc'],
            're': !!aPreset['re'],
            'default': aPreset['default'] || 'title',
        };
        aString.replace(/(\-?[A-Za-z]+:|\-)(?:"((?:\\"|[^"])*)"|([^ "]*))|(?:"((?:""|[^"])*)"|([^ "]+))/g, function(match, cmd, qterm, term, qterm2, term2){
            if (cmd) {
                var term = qterm ? qterm.replace(/""/g, '"') : term;
            } else {
                var term = qterm2 ? qterm2.replace(/""/g, '"') : term2;
            }
            // commands that don't require a term
            // if a term is given, it will then be treated as a "default include"
            // (unless expicitly cleared)
            switch (cmd) {
                case "mc:":
                    key.mc = true;
                    break;
                case "-mc:":
                    key.mc = false;
                    break;
                case "re:":
                    key.re = true;
                    break;
                case "-re:":
                    key.re = false;
                    break;
                case "type:":
                    addRule('type', 'include', term);
                    term = false;
                    break;
                case "-type:":
                    addRule('type', 'exclude', term);
                    term = false;
                    break;
                case "sort:":
                    addSort(term, 1);
                    term = false;
                    break;
                case "-sort:":
                    addSort(term, -1);
                    term = false;
                    break;
            }
            // commands that require a term
            if (term) {
                switch (cmd) {
                    case "id:":
                        addRule('id', 'include', parseStr(term));
                        break;
                    case "-id:":
                        addRule('id', 'exclude', parseStr(term));
                        break;
                    case "file:":
                        addRule('file', 'include', parseStr(term));
                        break;
                    case "-file:":
                        addRule('file', 'exclude', parseStr(term));
                        break;
                    case "source:":
                        addRule('source', 'include', parseStr(term));
                        break;
                    case "-source:":
                        addRule('source', 'exclude', parseStr(term));
                        break;
                    case "title:":
                        addRule('title', 'include', parseStr(term));
                        break;
                    case "-title:":
                        addRule('title', 'exclude', parseStr(term));
                        break;
                    case "comment:":
                        addRule('comment', 'include', parseStr(term));
                        break;
                    case "-comment:":
                        addRule('comment', 'exclude', parseStr(term));
                        break;
                    case "content:":
                        addRule('content', 'include', parseStr(term));
                        break;
                    case "-content:":
                        addRule('content', 'exclude', parseStr(term));
                        break;
                    case "tcc:":
                        addRule('tcc', 'include', parseStr(term));
                        break;
                    case "-tcc:":
                        addRule('tcc', 'exclude', parseStr(term));
                        break;
                    case "create:":
                        addRule('create', 'include', parseDate(term));
                        break;
                    case "-create:":
                        addRule('create', 'exclude', parseDate(term));
                        break;
                    case "modify:":
                        addRule('modify', 'include', parseDate(term));
                        break;
                    case "-modify:":
                        addRule('modify', 'exclude', parseDate(term));
                        break;
                    case "-":
                        addRule(key['default'], 'exclude', parseStr(term));
                        break;
                    default:
                        addRule(key['default'], 'include', parseStr(term));
                        break;
                }
            }
            return "";

            function addRule(name, type, value) {
                if (key.rule[name] === undefined) key.rule[name] = { 'include': [], 'exclude': [] };
                key.rule[name][type].push(value);
            }

            function addSort(field, order) {
                key.sort.push([field, order]);
            }

            function addError(msg) {
                key.error.push(msg);
            }

            function parseStr(term) {
                var options = key.mc ? 'gm' : 'igm';
                if (key.re) {
                    try {
                        var regex = new RegExp(term, options);
                    } catch(ex) {
                        addError(sbCommonUtils.lang("ERR_SEARCH_REGEXP_INAVLID", term));
                        return null;
                    }
                } else {
                    var regex = new RegExp(sbCommonUtils.escapeRegExp(term), options);
                }
                return regex;
            }

            function parseDate(term) {
                var match = term.match(/^(\d{0,14})-?(\d{0,14})$/);
                if (!match) {
                    addError(sbCommonUtils.lang("ERR_SEARCH_DATE_INAVLID", term));
                    return null;
                }
                var since = match[1] ? fill(match[1], 14) : fill(match[1], 14);
                var until = match[2] ? fill(match[2], 14) : fill(match[2], 14, "9");
                return [parseInt(since, 10), parseInt(until, 10)];
            }

            function fill(n, width, z) {
                z = z || '0';
                n = n + '';
                return n.length >= width ? n : n + new Array(width - n.length + 1).join(z);
            }
        });
        return key;
    },

    // aKey: array, generated via parse()
    // aRes: the resource object to test
    // aText: text from the fulltext cache; false for a filtering search
    // aFile: file name from the fulltext cache; false for a filtering search
    match: function(aKey, aRes, aText, aFile) {
        this.hits = {};
        for (var i in aKey.rule) {
            if (!this['_match_'+i](aKey.rule[i], aRes, aText, aFile)) return false;
        }
        return this.hits;
    },

    _match_tcc: function(aKeyItem, aRes, aText, aFile) {
        var title = sbDataSource.getProperty(aRes, "title");
        var comment = sbDataSource.getProperty(aRes, "comment");
        var content = aText || "";
        var regex;
        for (var i=0, len=aKeyItem.exclude.length; i<len; i++) {
            regex = aKeyItem.exclude[i];
            regex.lastIndex = 0;
            if (regex.test(title)) {
                return false;
            }
            regex.lastIndex = 0;
            if (regex.test(comment)) {
                return false;
            }
            regex.lastIndex = 0;
            if (regex.test(content)) {
                return false;
            }
        }
        for (var i=0, len=aKeyItem.include.length; i<len; i++) {
            regex = aKeyItem.include[i];
            var result = false;
            regex.lastIndex = 0;
            if (regex.test(title)) {
                result = true;
                this.updateHits('title', regex.lastIndex - RegExp.lastMatch.length);
            }
            regex.lastIndex = 0;
            if (regex.test(comment)) {
                result = true;
                this.updateHits('comment', regex.lastIndex - RegExp.lastMatch.length);
            }
            regex.lastIndex = 0;
            if (regex.test(content)) {
                result = true;
                this.updateHits('content', regex.lastIndex - RegExp.lastMatch.length);
            }
            if (!result) return false;
        }
        return true;
    },

    _match_content: function(aKeyItem, aRes, aText, aFile) {
        return this.matchText(aKeyItem, "content", aText || "");
    },

    _match_all: function(aKeyItem, aRes, aText, aFile) {
        var title = sbDataSource.getProperty(aRes, "title");
        var comment = sbDataSource.getProperty(aRes, "comment");
        var id = sbDataSource.getProperty(aRes, "id");
        var source = sbDataSource.getProperty(aRes, "source");
        return this.matchText(aKeyItem, "all", [title, comment, source, id].join("\n"));
    },

    _match_id: function(aKeyItem, aRes, aText, aFile) {
        return this.matchText(aKeyItem, "id", sbDataSource.getProperty(aRes, "id"));
    },

    _match_file: function(aKeyItem, aRes, aText, aFile) {
        return this.matchText(aKeyItem, "file", aFile || "");
    },

    _match_title: function(aKeyItem, aRes, aText, aFile) {
        return this.matchText(aKeyItem, "title", sbDataSource.getProperty(aRes, "title"));
    },

    _match_comment: function(aKeyItem, aRes, aText, aFile) {
        return this.matchText(aKeyItem, "comment", sbDataSource.getProperty(aRes, "comment"));
    },

    _match_source: function(aKeyItem, aRes, aText, aFile) {
        return this.matchText(aKeyItem, "source", sbDataSource.getProperty(aRes, "source"));
    },

    _match_type: function(aKeyItem, aRes, aText, aFile) {
        var type = sbDataSource.getProperty(aRes, "type");
        for (var i=0, len=aKeyItem.exclude.length; i<len; i++) {
            if (type == aKeyItem.exclude[i]) {
                return false;
            }
        }
        // uses "or" clause
        if (!aKeyItem.include.length) return true;
        for (var i=0, len=aKeyItem.include.length; i<len; i++) {
            if (type == aKeyItem.include[i]) {
                return true;
            }
        }
        return false;
    },

    _match_create: function(aKeyItem, aRes, aText, aFile) {
        return this.matchDate(aKeyItem, sbDataSource.getProperty(aRes, "create"));
    },

    _match_modify: function(aKeyItem, aRes, aText, aFile) {
        return this.matchDate(aKeyItem, sbDataSource.getProperty(aRes, "modify"));
    },

    matchText: function(aKeyItem, aKeyName, aText) {
        var regex;
        for (var i=0, len=aKeyItem.exclude.length; i<len; i++) {
            regex = aKeyItem.exclude[i];
            regex.lastIndex = 0;
            if (regex.test(aText)) {
                return false;
            }
        }
        for (var i=0, len=aKeyItem.include.length; i<len; i++) {
            regex = aKeyItem.include[i];
            regex.lastIndex = 0;
            if (!regex.test(aText)) {
                return false;
            } else {
                this.updateHits(aKeyName, regex.lastIndex - RegExp.lastMatch.length);
            }
        }
        return true;
    },

    matchDate: function(aKeyItem, aDate) {
        if (!aDate) return false;
        var aDate = parseInt(aDate, 10);
        for (var i=0, len=aKeyItem.exclude.length; i<len; i++) {
            if (aKeyItem.exclude[i][0] <= aDate && aDate <= aKeyItem.exclude[i][1]) {
                return false;
            }
        }
        for (var i=0, len=aKeyItem.include.length; i<len; i++) {
            if (!(aKeyItem.include[i][0] <= aDate && aDate <= aKeyItem.include[i][1])) {
                return false;
            }
        }
        return true;
    },

    updateHits: function(name, index) {
        if (this.hits[name] === undefined || index < this.hits[name]) this.hits[name] = index;
    },

};

window.addEventListener("SidebarFocused", function () {
    return document.getElementById("sbTree").focus();
}, false);



