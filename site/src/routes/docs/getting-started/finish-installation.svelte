<script lang="ts">
	import * as Code from '#lib/components/ui/code/index.js';
	import { GITHUB_URL } from '../../site-nav';
</script>

<!-- The last section of every self-hosting guide; add `finish-the-installation` to its sections. -->
<h2 id="finish-the-installation">Finish the installation</h2>

<p>
	The first visit redirects to <Code.Root>/install</Code.Root>. Enter the email address and password
	of your admin account: Pouchbase creates the D1 databases through the Cloudflare API, then the
	account, and signs you in right away.
</p>

<p>
	To skip that page, set <Code.Root>POUCHBASE_ADMIN_EMAIL</Code.Root> and
	<Code.Root>POUCHBASE_ADMIN_PASSWORD</Code.Root> (at least 10 characters): Pouchbase then installs itself
	with that admin on the first request. Once it is installed, both are ignored.
</p>

<p>
	From there, everything is managed in the admin interface: collections, users and sign-in, files,
	backups and functions. The
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external link -->
	<a href="{GITHUB_URL}#readme">README on GitHub</a> covers each of them in detail.
</p>
