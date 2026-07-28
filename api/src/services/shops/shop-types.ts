/**
 * Une boutique telle que l'API la sert.
 *
 * `inventory_count` vient d'une sous-requête corrélée, `display_shop_type` d'une
 * mise en forme faite en JS — ni l'un ni l'autre n'est une colonne.
 */
export interface PublicShop {
  id: number;
  name: string;
  class_name: string;
  shop_type: string;
  /**
   * Le lieu ou la boutique se trouve, quand elle se trouve quelque part.
   *
   * **Nul veut dire « pas un endroit ou l'on va ».** Sur 136 boutiques servies,
   * 74 sont rattachees a un lieu et 62 ne le sont pas : gabarits d'inventaire
   * (« Admin Small Base A », « Landing Services Rs Full 0001 ») qui decrivent ce
   * qu'on trouve dans n'importe quel avant-poste, boutiques d'evenement des
   * ventes anniversaire 2018-2019, et treize boutiques de Port Olisar — un lieu
   * reel, retire de l'univers apres la 3.20 et qu'UEX n'a plus jamais vu parmi
   * ses 587 terminaux.
   *
   * La separation est nette et se lit ici : aucune heuristique sur les noms
   * n'est necessaire.
   */
  location_uuid: string | null;
  location: string | null;
  planet_moon: string | null;
  city: string | null;
  system: string | null;
  canonical_shop_key: string;
  loc_key: string | null;
  franchise_slug: string;
  location_slug: string;
  franchise_loc_key: string | null;
  p4k_path: string;
  /** Compté par sous-requête sur l'inventaire. */
  inventory_count: number;
  /** Libellé mis en forme pour l'affichage. */
  display_shop_type: string;
}
