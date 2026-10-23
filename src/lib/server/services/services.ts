import { AuthService } from './auth.service';
import { BackupsService } from './backups.service';
import { CloudflareService } from './cloudflare.service';
import { CollectionsService } from './collections.service';
import { DatabaseService } from './database.service';
import { FieldsService } from './fields.service';
import { FilesService } from './files.service';
import { FunctionsService } from './functions.service';
import { IndexesService } from './indexes.service';
import { InstallService } from './install.service';
import { MailService } from './mail.service';
import { OAuthProvidersService } from './oauth-providers.service';
import { PluginsService } from './plugins.service';
import { RecordsService } from './records.service';
import { SessionsService } from './sessions.service';
import { SettingsService } from './settings.service';
import { StorageService } from './storage.service';
import { TypesService } from './types.service';
import { UsersService } from './users.service';

export class Services {
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

	oauthProviders() {
		return new OAuthProvidersService();
	}

	plugins() {
		return new PluginsService();
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

	users() {
		return new UsersService();
	}
}
