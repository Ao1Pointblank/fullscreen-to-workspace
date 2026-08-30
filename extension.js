const Meta = imports.gi.Meta;
const Gio = imports.gi.Gio;
const settings = imports.ui.settings;
const mainloop = imports.mainloop;

const range = (n) => Array(n+1).join().split("").map((_,i) => i);
const POLL_INTERVAL = 300; // ms

let _handles, _previousWorkspace, _settings, _pollId, _lastFullscreen;
let _wsSettings; // Gio.Settings for workspace-names

function getWorkspaceNames() {
	return _wsSettings.get_strv("workspace-names");
}

function setWorkspaceNames(names) {
	_wsSettings.set_strv("workspace-names", names);
}

function setWorkspaceName(index, name) {
	let names = getWorkspaceNames();
	// Resize array to match
	while (names.length <= index)
		names.push("");
	names[index] = name;
	setWorkspaceNames(names);
}

function removeWorkspaceName(index) {
	let names = getWorkspaceNames();
	if (index < names.length) {
		names.splice(index, 1);
		setWorkspaceNames(names);
	}
}

function maximize(win) {
	if (_previousWorkspace[win] != undefined)
		return;
	if (_settings.use_cur_ws && win.get_workspace().list_windows().filter(w => !w.is_on_all_workspaces()).length == 1)
		return;
	_previousWorkspace[win] = win.get_workspace();
	let target_ws = global.screen.append_new_workspace(false, global.get_current_time());
	// Name the new workspace after the app
	let appName = win.get_wm_class() || win.get_title() || "Workspace";
	setWorkspaceName(target_ws.index(), appName);
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
	if (!clean_ws)
		win.change_workspace(previous);
	previous.activate(global.get_current_time());
	// Don't leave empty created workspaces behind.
	if (old_ws.list_windows().filter(w => !w.is_on_all_workspaces()).length == 0) {
		let idx = old_ws.index();
		global.screen.remove_workspace(old_ws, global.get_current_time());
		if (idx >= 0)
			mainloop.idle_add(() => removeWorkspaceName(idx));
	}
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
		if (wasFs === undefined)
			return;

		if (isFs && !wasFs) {
			maximize(win);
		} else if (!isFs && wasFs) {
			unmaximize(win);
		}
	});

	Object.keys(_lastFullscreen).forEach((key) => {
		if (!(key in currentFullscreen))
			delete _lastFullscreen[key];
	});

	_lastFullscreen = currentFullscreen;
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
	_settings = new SettingsHandler(extensionMeta.uuid);
	_wsSettings = new Gio.Settings({ schema_id: "org.cinnamon.desktop.wm.preferences" });
}

function enable() {
	_pollId = mainloop.timeout_add(POLL_INTERVAL, poll);

	_handles["wsadd"] = [global.screen, global.screen.connect("workspace-added", (_, wsi) => {
		let ws = global.screen.get_workspace_by_index(wsi);
		let remove_event = ws.connect("window-removed", handleClose);
		_handles[ws] = [ws, remove_event];
	})];

	_handles["wsdel"] = [global.screen, global.screen.connect("workspace-removed", () => {
		Object.keys(_handles)
			.filter((key) => {
				let obj = _handles[key][0];
				return (obj instanceof Meta.Workspace) && (obj.index() < 0);
			})
			.forEach((key) => delete _handles[key]);
	})];

	range(global.screen.n_workspaces).map((i) => global.screen.get_workspace_by_index(i)).forEach((ws) => {
		let remove_event = ws.connect("window-removed", handleClose);
		_handles[ws] = [ws, remove_event];
	});
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
}const Meta = imports.gi.Meta;
const settings = imports.ui.settings;
const mainloop = imports.mainloop;

// pythonic
const range = (n) => Array(n+1).join().split("").map((_,i) => i);

let _handles, _previousWorkspace, _settings;

function maximize(win) {
	// idempotency
	if (_previousWorkspace[win] != undefined)
		return;
	// If the current workspace doesn't have any other windows make it maximized here (depending on option).
	if (_settings.use_cur_ws && win.get_workspace().list_windows().filter(w => !w.is_on_all_workspaces()).length == 1)
		return;
	_previousWorkspace[win] = win.get_workspace();
	let target_ws = global.screen.append_new_workspace(false, global.get_current_time());
	win.change_workspace(target_ws);
	target_ws.activate(global.get_current_time());
}

function unmaximize(win, clean_ws) {
	let previous = _previousWorkspace[win];
	delete _previousWorkspace[win];
	if (previous == undefined)
		return;
	// check if previous workspace still exists, otherwise use first one
	if (previous.index() < 0)
		previous = global.screen.get_workspace_by_index(0);
	let old_ws = clean_ws || win.get_workspace();
	if (!clean_ws)
		win.change_workspace(previous);
	previous.activate(global.get_current_time());
	// Don't leave empty created workspaces behind.
	if (old_ws.list_windows().filter(w => !w.is_on_all_workspaces()).length == 0)
		global.screen.remove_workspace(old_ws, global.get_current_time());
}

function handleResize(actor) {
	mainloop.idle_add(() => {
		let win = actor.meta_window;
		if (!win || win.window_type !== Meta.WindowType.NORMAL)
			return;
		if (win.is_fullscreen())
			maximize(win);
		else
			unmaximize(win);
	});
}

function handleClose(workspace, win) {
	// idle in order for `win.get_workspace()` to return consistent result
	mainloop.idle_add(() => {
		// ignore if not a main window or the window is actually changing ws
		if (win.window_type !== Meta.WindowType.NORMAL || win.get_workspace() != null)
			return;
		let actor = global.get_window_actors().filter((act) => act.meta_window == win)[0];
		if (!(actor in _handles))
			return;
		if (win.is_fullscreen())
			unmaximize(win, workspace);
		delete _handles[actor];
	});
}


function SettingsHandler(uuid) {
	this._settings = new settings.ExtensionSettings(this, uuid);
	this._settings.bindProperty(settings.BindingDirection.IN, "allow-current-workspace", "use_cur_ws", () => undefined);
}

// Mandatory Functions //

function init(extensionMeta) {
	_handles = {};
	_previousWorkspace = {};
	_settings = new SettingsHandler(extensionMeta.uuid);
}

function enable() {
	// TODO: maybe use a better method to extract parent actor.
	// the problem is that `window-added`/`window-removed` only give screen/ws and a window
	// but `size-changed` requires the parent actor, how to get it in a meaningful way?
	_handles[global.screen+"winadd"] = [global.screen, global.screen.connect("window-added", (_, win) => {
		if (win.window_type !== Meta.WindowType.NORMAL)
			return;
		// for some reason we need to idle, otherwise the window is not captured
		// among the global actors yet
		mainloop.idle_add(() => {
			let actor = global.get_window_actors().filter((act) => act.meta_window == win)[0];
			if (actor in _handles)
				return;
			// TODO: is there a better way to bind this event, instead of binding
			// it on all possible windows? I think that this would scale very poorly
			let resize_event = actor.connect("size-changed", handleResize);
			_handles[actor] = [actor, resize_event];
		});
	})];
	_handles[global.screen+"wsadd"] = [global.screen, global.screen.connect("workspace-added", (_, wsi) => {
		// bind window-removed on the created ws
		let ws = global.screen.get_workspace_by_index(wsi);
		let remove_event = ws.connect("window-removed", handleClose);
		_handles[ws] = [ws, remove_event];
	})];
	_handles[global.screen+"wsdel"] = [global.screen, global.screen.connect("workspace-removed", () => {
		Object.keys(_handles)
			.filter((key) => {
				let obj = _handles[key][0];
				return (obj instanceof Meta.Workspace) && (obj.index() < 0);
			})
			.forEach((key) => delete _handles[key]);
	})];
	// bind existing windows
	global.get_window_actors().forEach((actor) => {
		let resize_event = actor.connect("size-changed", handleResize);
		_handles[actor] = [actor, resize_event];
	});
	// bind existing workspaces
	range(global.screen.n_workspaces).map((i) => global.screen.get_workspace_by_index(i)).forEach((ws) => {
		let remove_event = ws.connect("window-removed", handleClose);
		_handles[ws] = [ws, remove_event];
	});
}

function disable() {
	Object.keys(_handles).forEach((key) => {
		let [obj, event_id] = _handles[key];
		obj.disconnect(event_id);
	});
}
