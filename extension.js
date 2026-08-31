const Meta = imports.gi.Meta;
const Gio = imports.gi.Gio;
const settings = imports.ui.settings;
const mainloop = imports.mainloop;

const range = (n) => Array(n+1).join().split("").map((_,i) => i);
const POLL_INTERVAL = 300;
const DEBOUNCE_MS = 800;

let _handles, _previousWorkspace, _settings, _pollId, _lastFullscreen, _debounce;
let _wsSettings, _exclusiveWs;

function setWorkspaceName(index, name) {
	let names = _wsSettings.get_strv("workspace-names");
	while (names.length <= index)
		names.push("");
	names[index] = name;
	_wsSettings.set_strv("workspace-names", names);
}

function removeWorkspaceName(index) {
	let names = _wsSettings.get_strv("workspace-names");
	if (index < names.length) {
		names.splice(index, 1);
		_wsSettings.set_strv("workspace-names", names);
	}
}

function isExclusive(ws) {
	return _exclusiveWs.includes(ws);
}

function getLastNormalWs() {
	for (let i = global.screen.n_workspaces - 1; i >= 0; i--) {
		let ws = global.screen.get_workspace_by_index(i);
		if (!isExclusive(ws))
			return ws;
	}
	return global.screen.get_workspace_by_index(0);
}

function bindWorkspace(ws) {
	_handles[ws + "rem"] = [ws, ws.connect("window-removed", handleClose)];
	_handles[ws + "add"] = [ws, ws.connect("window-added", handleWindowAdded)];
}

function maximize(win) {
	if (_previousWorkspace[win] != undefined)
		return;
	if (_settings.use_cur_ws && win.get_workspace().list_windows().filter(w => !w.is_on_all_workspaces()).length == 1)
		return;
	_previousWorkspace[win] = win.get_workspace();
	let target_ws = global.screen.append_new_workspace(false, global.get_current_time());
	let appName = win.get_wm_class() || win.get_title() || "Workspace";
	setWorkspaceName(target_ws.index(), appName);
	_exclusiveWs.push(target_ws);
	win.change_workspace(target_ws);
	target_ws.activate(global.get_current_time());
}

function unmaximize(win, clean_ws) {
	let previous = _previousWorkspace[win];
	delete _previousWorkspace[win];
	if (previous == undefined)
		return;
	if (previous.index() < 0)
		previous = global.screen.get_workspace_by_index(0);
	let old_ws = clean_ws || win.get_workspace();
	_exclusiveWs = _exclusiveWs.filter(w => w !== old_ws);
	if (!clean_ws)
		win.change_workspace(previous);
	previous.activate(global.get_current_time());
	mainloop.idle_add(() => {
		if (old_ws.list_windows().filter(w => !w.is_on_all_workspaces()).length == 0) {
			let idx = old_ws.index();
			global.screen.remove_workspace(old_ws, global.get_current_time());
			if (idx >= 0)
				mainloop.idle_add(() => removeWorkspaceName(idx));
		}
	});
}

function handleWindowAdded(workspace, win) {
	mainloop.idle_add(() => {
		if (!isExclusive(workspace))
			return;
		if (win.window_type !== Meta.WindowType.NORMAL)
			return;
		if (win.is_fullscreen())
			return;
		let target = getLastNormalWs();
		win.change_workspace(target);
		target.activate(global.get_current_time());
	});
}

function poll() {
	let actors = global.get_window_actors();
	let currentFullscreen = {};

	actors.forEach((actor) => {
		let win = actor.meta_window;
		if (!win || win.window_type !== Meta.WindowType.NORMAL)
			return;
		let isFs = win.is_fullscreen();
		currentFullscreen[win] = isFs;

		let wasFs = _lastFullscreen[win];
		if (wasFs === undefined) {
			if (isFs) {
				mainloop.idle_add(() => {
					if (win.is_fullscreen() && win.window_type === Meta.WindowType.NORMAL)
						maximize(win);
				});
			}
			return;
		}

		if (isFs && !wasFs) {
			if (Date.now() - (_debounce[win] || 0) < DEBOUNCE_MS)
				return;
			_debounce[win] = Date.now();
			maximize(win);
		} else if (!isFs && wasFs) {
			if (Date.now() - (_debounce[win] || 0) < DEBOUNCE_MS)
				return;
			_debounce[win] = Date.now();
			unmaximize(win);
		}
	});

	Object.keys(_lastFullscreen).forEach((key) => {
		if (!(key in currentFullscreen)) {
			delete _lastFullscreen[key];
			delete _debounce[key];
		}
	});

	_lastFullscreen = currentFullscreen;

	// Safety: drop exclusive workspaces that no longer have a fullscreen window
	_exclusiveWs = _exclusiveWs.filter(ws => {
		if (ws.index() < 0) return false;
		return ws.list_windows().some(w => w.is_fullscreen() && w.window_type === Meta.WindowType.NORMAL);
	});

	return true;
}

function handleClose(workspace, win) {
	mainloop.idle_add(() => {
		if (win.window_type !== Meta.WindowType.NORMAL || win.get_workspace() != null)
			return;
		if (win.is_fullscreen())
			unmaximize(win, workspace);
	});
}

function SettingsHandler(uuid) {
	this._settings = new settings.ExtensionSettings(this, uuid);
	this._settings.bindProperty(settings.BindingDirection.IN, "allow-current-workspace", "use_cur_ws", () => undefined);
}

function init(extensionMeta) {
	_handles = {};
	_previousWorkspace = {};
	_lastFullscreen = {};
	_debounce = {};
	_exclusiveWs = [];
	_settings = new SettingsHandler(extensionMeta.uuid);
	_wsSettings = new Gio.Settings({ schema_id: "org.cinnamon.desktop.wm.preferences" });
}

function enable() {
	_pollId = mainloop.timeout_add(POLL_INTERVAL, poll);

	_handles["wsadd"] = [global.screen, global.screen.connect("workspace-added", (_, wsi) => {
		bindWorkspace(global.screen.get_workspace_by_index(wsi));
	})];

	_handles["wsdel"] = [global.screen, global.screen.connect("workspace-removed", () => {
		for (let key in _handles) {
			let obj = _handles[key][0];
			if (obj instanceof Meta.Workspace && obj.index() < 0)
				delete _handles[key];
		}
	})];

	range(global.screen.n_workspaces).forEach((i) => bindWorkspace(global.screen.get_workspace_by_index(i)));
}

function disable() {
	if (_pollId) {
		mainloop.source_remove(_pollId);
		_pollId = null;
	}
	Object.keys(_handles).forEach((key) => {
		let [obj, event_id] = _handles[key];
		obj.disconnect(event_id);
	});
	_handles = {};
	_lastFullscreen = {};
	_debounce = {};
	_exclusiveWs = [];
}   
