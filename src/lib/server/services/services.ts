import { AuthService } from './auth.service';
import { CollectionsService } from './collections.service';
import { DatabaseService } from './database.service';
import { FieldsService } from './fields.service';
import { IndexesService } from './indexes.service';
import { InstallService } from './install.service';
import { OAuthProvidersService } from './oauth-providers.service';
import { RecordsService } from './records.service';
import { SessionsService } from './sessions.service';
import { SettingsService } from './settings.service';
import { UsersService } from './users.service';

export class Services {
	auth() {
		return new AuthService();
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

	indexes() {
		return new IndexesService();
	}

	install() {
		return new InstallService();
	}

	oauthProviders() {
		return new OAuthProvidersService();
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

	users() {
		return new UsersService();
	}
}
