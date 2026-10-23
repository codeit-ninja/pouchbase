import { ApiKeysService } from './api-keys.service';
import { AuthService } from './auth.service';
import { BackupsService } from './backups.service';
import { CloudflareService } from './cloudflare.service';
import { CollectionsService } from './collections.service';
import { DatabaseService } from './database.service';
import { EnvironmentsService } from './environments.service';
import { FieldsService } from './fields.service';
import { FilesService } from './files.service';
import { FunctionsService } from './functions.service';
import { IndexesService } from './indexes.service';
import { InstallService } from './install.service';
import { MailService } from './mail.service';
import { MailTemplatesService } from './mail-templates.service';
import { OAuthProvidersService } from './oauth-providers.service';
import { PluginsService } from './plugins.service';
import { RealtimeService } from './realtime.service';
import { RecordsService } from './records.service';
import { SessionsService } from './sessions.service';
import { SettingsService } from './settings.service';
import { StorageService } from './storage.service';
import { TypesService } from './types.service';
import { UpdatesService } from './updates.service';
import { UsersService } from './users.service';

export class Services {
	apiKeys() {
		return new ApiKeysService();
	}

	auth() {
		return new AuthService();
	}

	backups() {
		return new BackupsService();
	}

	cloudflare() {
		return new CloudflareService();
	}

	collections() {
		return new CollectionsService();
	}

	database() {
		return new DatabaseService();
	}

	environments() {
		return new EnvironmentsService();
	}

	fields() {
		return new FieldsService();
	}

	files() {
		return new FilesService();
	}

	functions() {
		return new FunctionsService();
	}

	indexes() {
		return new IndexesService();
	}

	install() {
		return new InstallService();
	}

	mail() {
		return new MailService();
	}

	mailTemplates() {
		return new MailTemplatesService();
	}

	oauthProviders() {
		return new OAuthProvidersService();
	}

	plugins() {
		return new PluginsService();
	}

	realtime() {
		return new RealtimeService();
	}

	records() {
		return new RecordsService();
	}

	sessions() {
		return new SessionsService();
	}

	settings() {
		return new SettingsService();
	}

	storage() {
		return new StorageService();
	}

	types() {
		return new TypesService();
	}

	updates() {
		return new UpdatesService();
	}

	users() {
		return new UsersService();
	}
}
