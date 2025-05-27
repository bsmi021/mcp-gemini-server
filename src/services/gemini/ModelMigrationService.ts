import { logger } from "../../utils/logger.js";

export class ModelMigrationService {
  private static instance: ModelMigrationService | null = null;

  static getInstance(): ModelMigrationService {
    if (!ModelMigrationService.instance) {
      ModelMigrationService.instance = new ModelMigrationService();
    }
    return ModelMigrationService.instance;
  }

  migrateEnvironmentVariables(): void {
    this.migrateSingleModelToArray();
    this.provideImageModelDefaults();
    this.migrateDeprecatedModelNames();
    this.logMigrationWarnings();
  }

  private migrateSingleModelToArray(): void {
    if (process.env.GOOGLE_GEMINI_MODEL && !process.env.GOOGLE_GEMINI_MODELS) {
      const singleModel = process.env.GOOGLE_GEMINI_MODEL;
      process.env.GOOGLE_GEMINI_MODELS = JSON.stringify([singleModel]);

      logger.info(
        "[ModelMigrationService] Migrated GOOGLE_GEMINI_MODEL to GOOGLE_GEMINI_MODELS array format",
        {
          originalModel: singleModel,
        }
      );
    }
  }

  private provideImageModelDefaults(): void {
    if (!process.env.GOOGLE_GEMINI_IMAGE_MODELS) {
      const defaultImageModels = [
        "imagen-3.0-generate-002",
        "gemini-2.0-flash-preview-image-generation",
      ];
      process.env.GOOGLE_GEMINI_IMAGE_MODELS =
        JSON.stringify(defaultImageModels);

      logger.info(
        "[ModelMigrationService] Set default image generation models",
        {
          models: defaultImageModels,
        }
      );
    }
  }

  private migrateDeprecatedModelNames(): void {
    const deprecatedMappings = {
      "gemini-1.5-pro-latest": "gemini-1.5-pro",
      "gemini-1.5-flash-latest": "gemini-1.5-flash",
      "gemini-flash-2.0": "gemini-2.0-flash",
      "gemini-2.5-pro": "gemini-2.5-pro-preview-05-06",
      "gemini-2.5-flash": "gemini-2.5-flash-preview-05-20",
      "gemini-2.5-pro-exp-03-25": "gemini-2.5-pro-preview-05-06",
      "gemini-2.5-flash-exp-latest": "gemini-2.5-flash-preview-05-20",
      "imagen-3.1-generate-003": "imagen-3.0-generate-002",
    };

    this.migrateModelsInEnvVar("GOOGLE_GEMINI_MODELS", deprecatedMappings);
    this.migrateModelsInEnvVar("GOOGLE_GEMINI_TEXT_MODELS", deprecatedMappings);
    this.migrateModelsInEnvVar(
      "GOOGLE_GEMINI_IMAGE_MODELS",
      deprecatedMappings
    );
    this.migrateModelsInEnvVar("GOOGLE_GEMINI_CODE_MODELS", deprecatedMappings);

    if (process.env.GOOGLE_GEMINI_DEFAULT_MODEL) {
      const currentDefault = process.env.GOOGLE_GEMINI_DEFAULT_MODEL;
      const newDefault =
        deprecatedMappings[currentDefault as keyof typeof deprecatedMappings];

      if (newDefault) {
        process.env.GOOGLE_GEMINI_DEFAULT_MODEL = newDefault;
        logger.warn(
          "[ModelMigrationService] Migrated deprecated default model",
          {
            oldModel: currentDefault,
            newModel: newDefault,
          }
        );
      }
    }
  }

  private migrateModelsInEnvVar(
    envVarName: string,
    mappings: Record<string, string>
  ): void {
    const envValue = process.env[envVarName];
    if (!envValue) return;

    try {
      const models = JSON.parse(envValue);
      if (!Array.isArray(models)) return;

      let hasChanges = false;
      const migratedModels = models.map((model) => {
        const newModel = mappings[model];
        if (newModel) {
          hasChanges = true;
          logger.warn(
            `[ModelMigrationService] Migrated deprecated model in ${envVarName}`,
            {
              oldModel: model,
              newModel,
            }
          );
          return newModel;
        }
        return model;
      });

      if (hasChanges) {
        process.env[envVarName] = JSON.stringify(migratedModels);
      }
    } catch (error) {
      logger.warn(
        `[ModelMigrationService] Failed to parse ${envVarName} for migration`,
        { error }
      );
    }
  }

  private logMigrationWarnings(): void {
    const deprecationNotices: string[] = [];

    if (process.env.GOOGLE_GEMINI_MODEL && !process.env.GOOGLE_GEMINI_MODELS) {
      deprecationNotices.push(
        "GOOGLE_GEMINI_MODEL is deprecated. Use GOOGLE_GEMINI_MODELS array instead."
      );
    }

    if (
      process.env.GOOGLE_GEMINI_ROUTING_PREFER_COST === undefined &&
      process.env.GOOGLE_GEMINI_ROUTING_PREFER_SPEED === undefined &&
      process.env.GOOGLE_GEMINI_ROUTING_PREFER_QUALITY === undefined
    ) {
      logger.info(
        "[ModelMigrationService] No routing preferences set. Using quality-optimized defaults."
      );
    }

    deprecationNotices.forEach((notice) => {
      logger.warn(`[ModelMigrationService] DEPRECATION: ${notice}`);
    });

    if (deprecationNotices.length > 0) {
      logger.info(
        "[ModelMigrationService] Migration completed. See documentation for updated configuration format."
      );
    }
  }

  validateConfiguration(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    const requiredEnvVars = ["GOOGLE_GEMINI_API_KEY"];
    requiredEnvVars.forEach((varName) => {
      if (!process.env[varName]) {
        errors.push(`Missing required environment variable: ${varName}`);
      }
    });

    const modelArrayVars = [
      "GOOGLE_GEMINI_MODELS",
      "GOOGLE_GEMINI_IMAGE_MODELS",
      "GOOGLE_GEMINI_CODE_MODELS",
    ];
    modelArrayVars.forEach((varName) => {
      const value = process.env[varName];
      if (value) {
        try {
          const parsed = JSON.parse(value);
          if (!Array.isArray(parsed)) {
            errors.push(`${varName} must be a JSON array of strings`);
          } else if (!parsed.every((item) => typeof item === "string")) {
            errors.push(`${varName} must contain only string values`);
          } else if (parsed.length === 0) {
            errors.push(`${varName} cannot be an empty array`);
          }
        } catch (error) {
          errors.push(`${varName} must be valid JSON: ${error}`);
        }
      }
    });

    const booleanVars = [
      "GOOGLE_GEMINI_ROUTING_PREFER_COST",
      "GOOGLE_GEMINI_ROUTING_PREFER_SPEED",
      "GOOGLE_GEMINI_ROUTING_PREFER_QUALITY",
    ];
    booleanVars.forEach((varName) => {
      const value = process.env[varName];
      if (value && !["true", "false"].includes(value.toLowerCase())) {
        errors.push(`${varName} must be 'true' or 'false' if provided`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  getDeprecatedFeatures(): string[] {
    const deprecated: string[] = [];

    if (process.env.GOOGLE_GEMINI_MODEL) {
      deprecated.push(
        "GOOGLE_GEMINI_MODEL environment variable (use GOOGLE_GEMINI_MODELS array)"
      );
    }

    const oldModelNames = [
      "gemini-1.5-pro-latest",
      "gemini-1.5-flash-latest",
      "gemini-flash-2.0",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-pro-exp-03-25",
      "gemini-2.5-flash-exp-latest",
      "imagen-3.1-generate-003",
    ];

    const allEnvVars = [
      process.env.GOOGLE_GEMINI_MODELS,
      process.env.GOOGLE_GEMINI_IMAGE_MODELS,
      process.env.GOOGLE_GEMINI_CODE_MODELS,
      process.env.GOOGLE_GEMINI_DEFAULT_MODEL,
    ].filter(Boolean);

    allEnvVars.forEach((envVar) => {
      try {
        const models =
          typeof envVar === "string" && envVar.startsWith("[")
            ? JSON.parse(envVar)
            : [envVar];

        models.forEach((model: string) => {
          if (oldModelNames.includes(model)) {
            deprecated.push(`Model name: ${model}`);
          }
        });
      } catch (error) {
        if (oldModelNames.includes(envVar as string)) {
          deprecated.push(`Model name: ${envVar}`);
        }
      }
    });

    return [...new Set(deprecated)];
  }
}
