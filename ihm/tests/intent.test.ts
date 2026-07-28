import { describe, expect, it } from 'vitest';
import { parseIntent } from '@/lib/intent';

describe('parseIntent', () => {
  it('reconnaît une question de vente sous ses formes courantes', () => {
    for (const query of ['sell agricium', 'where to sell agricium', 'where can i sell agricium', 'Where do I sell Agricium?']) {
      expect(parseIntent(query), query).toEqual({ kind: 'sell', subject: expect.stringMatching(/^agricium$/i) });
    }
  });

  it('reconnaît une question d’achat', () => {
    expect(parseIntent('buy laranite')).toEqual({ kind: 'buy', subject: 'laranite' });
    expect(parseIntent('where to buy laranite')).toEqual({ kind: 'buy', subject: 'laranite' });
    expect(parseIntent('cheapest laranite')).toEqual({ kind: 'buy', subject: 'laranite' });
  });

  it('lit la forme la plus spécifique en premier', () => {
    // Sans l'ordre des motifs, le sujet retiendrait « to sell agricium ».
    expect(parseIntent('where to sell agricium')?.subject).toBe('agricium');
  });

  it('retire les mots de liaison sans toucher au sujet', () => {
    expect(parseIntent('sell some agricium')?.subject).toBe('agricium');
    expect(parseIntent('buy the laranite')?.subject).toBe('laranite');
    // « Ammonia » commence par « a » : le motif exige un mot entier suivi d'un
    // espace, sinon il amputerait le sujet.
    expect(parseIntent('sell ammonia')?.subject).toBe('ammonia');
  });

  it('ne rend rien quand la saisie n’est pas une question', () => {
    for (const query of ['agricium', 'gladius', 'shield size 2', '']) {
      expect(parseIntent(query), query).toBeNull();
    }
  });

  it('refuse une question sans sujet plutôt que d’inventer la demande', () => {
    expect(parseIntent('sell')).toBeNull();
    expect(parseIntent('where to sell')).toBeNull();
    expect(parseIntent('buy a')).toBeNull();
  });
});
