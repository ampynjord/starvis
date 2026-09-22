-- Les missions telles que le courtier les propose.
--
-- `game.missions` vient de `ContractTemplate` : 494 enregistrements, aucune
-- récompense, et sept colonnes vides en permanence — dont `required_reputation`
-- et les quatre colonnes de lieu, que le relevé de remplissage signale à chaque
-- extraction.
--
-- `MissionBrokerEntry` porte 2 584 enregistrements, dont 1 978 publiables, et
-- **toutes ont une récompense**. C'est là que vivent le montant payé, la
-- légalité, la difficulté et le donneur.
--
-- Une table à part, et non des colonnes ajoutées à `missions` : les deux
-- structures décrivent des choses différentes — un contrat générique d'un côté,
-- une offre de courtier de l'autre — et les confondre produirait des lignes à
-- moitié vides des deux côtés.

CREATE TABLE "game"."mission_brokers" (
  "class_name"             VARCHAR(255) NOT NULL,
  "env"                    VARCHAR(10)  NOT NULL DEFAULT 'live',
  "title_loc_key"          VARCHAR(255),
  "title"                  VARCHAR(500),
  -- Le jeu compose certains titres à l'exécution : « ~mission(Contractor|
  -- BountyTitle) » est un gabarit, pas un libellé affichable.
  "title_is_template"      BOOLEAN      NOT NULL DEFAULT FALSE,
  "description_loc_key"    VARCHAR(255),
  "description"            TEXT,
  "giver_loc_key"          VARCHAR(255),
  "giver"                  VARCHAR(255),
  "mission_module"         VARCHAR(500),
  "mission_type"           VARCHAR(255),
  "reward_amount"          INTEGER,
  "reward_max"             INTEGER,
  "reward_currency"        VARCHAR(20),
  -- Nulle quand le jeu dit -1, c'est-à-dire « non fixée ».
  "difficulty"             INTEGER,
  "is_lawful"              BOOLEAN      NOT NULL DEFAULT TRUE,
  "once_only"              BOOLEAN      NOT NULL DEFAULT FALSE,
  "is_tutorial"            BOOLEAN      NOT NULL DEFAULT FALSE,
  "max_instances"          INTEGER,
  "deadline_seconds"       INTEGER,
  "available_in_prison"    BOOLEAN      NOT NULL DEFAULT FALSE,
  "fail_if_became_criminal" BOOLEAN     NOT NULL DEFAULT FALSE,
  "min_required_missions"  INTEGER,
  "raw_json"               JSONB,
  "extracted_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "mission_brokers_pkey" PRIMARY KEY ("class_name", "env")
);

-- « Combien ça paie » et « est-ce légal » sont les deux questions posées.
CREATE INDEX "mission_brokers_reward_idx" ON "game"."mission_brokers" ("env", "reward_amount" DESC);
CREATE INDEX "mission_brokers_lawful_idx" ON "game"."mission_brokers" ("env", "is_lawful");
