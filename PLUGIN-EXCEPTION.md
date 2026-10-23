# Pouchbase Plugin Exception

Version 1.0

This is an additional permission under section 7 of the GNU Affero General Public License,
version 3 ("AGPL"), granted by the copyright holders of Pouchbase. It applies to Pouchbase, which is
otherwise licensed under the AGPL (see [LICENSE](LICENSE)).

## Definitions

- **"Pouchbase"** means the software in this repository, licensed under the AGPL, including
  modified versions of it.
- **"Plugin API"** means the interfaces that Pouchbase offers to plugins: the plugin manifest
  (`pouchbase-plugin.json`), the bundle format, the server API (`definePlugin` and the plugin
  context), the props and modules available to plugin UI components, and the plugin registry API, as
  documented in and exposed by the `@pouchbasejs/plugin-sdk` package.
- **"Plugin"** means a work that is distributed separately from Pouchbase, that is loaded by
  Pouchbase at runtime (for example after being installed from a plugin registry), and that
  interacts with Pouchbase only through the Plugin API.

## Permission

1. You may create, use, copy, modify and distribute a Plugin under terms of your choice, including
   proprietary terms, regardless of the license of Pouchbase. Loading, running, compiling (for
   example compiling a Plugin's Svelte components on install) or communicating with a Plugin
   through the Plugin API does not, by itself, cause the Plugin to be covered by the AGPL.
2. You may convey Pouchbase together with Plugins, or install Plugins into a Pouchbase instance that
   you offer as a network service, without the Plugins becoming subject to the AGPL. Pouchbase itself
   remains subject to the AGPL, including section 13.

## Limits

This permission does not apply to a work that:

- copies, modifies or includes parts of Pouchbase other than the `@pouchbasejs/plugin-sdk` package
  (which is licensed separately under the MIT license); or
- interacts with Pouchbase through anything other than the Plugin API, for example by importing its
  internal modules or patching its source code.

Such a work is a modification of Pouchbase or a work based on it, and is covered by the AGPL.

## Removal

When you convey a modified version of Pouchbase, you may remove this exception from your version, as
allowed by section 7 of the AGPL. If you do, Plugins loaded by your version are no longer covered by
it.
