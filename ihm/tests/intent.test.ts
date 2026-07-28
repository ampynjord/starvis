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

describe('parseIntent — classement', () => {
  it('reconnaît une demande de meilleur', () => {
    expect(parseIntent('best shield')).toEqual({ kind: 'best', subject: 'shield', size: undefined });
    expect(parseIntent('top thruster')).toMatchObject({ kind: 'best', subject: 'thruster' });
    expect(parseIntent("what's the best cooler")).toMatchObject({ kind: 'best', subject: 'cooler' });
  });

  it('extrait la taille et la retire du sujet', () => {
    // Le sujet doit rester interrogeable : « shield size 2 » ne correspond à
    // aucun type de composant, « shield » si.
    expect(parseIntent('best shield size 2')).toEqual({ kind: 'best', subject: 'shield', size: 2 });
    expect(parseIntent('best size 3 shield')).toEqual({ kind: 'best', subject: 'shield', size: 3 });
    expect(parseIntent('best s1 thruster')).toEqual({ kind: 'best', subject: 'thruster', size: 1 });
  });

  it('ignore un nombre qui ne peut pas être une taille', () => {
    // Au-delà de 12, le nombre parlait d'autre chose ; le retirer mutilerait le
    // sujet.
    expect(parseIntent('best s99 rifle')).toMatchObject({ kind: 'best', subject: 's99 rifle' });
  });

  it('ne confond pas « best sell price » avec un classement', () => {
    expect(parseIntent('agricium best sell price')).toEqual({ kind: 'sell', subject: 'agricium' });
  });

  it('refuse un classement sans sujet une fois la taille retirée', () => {
    expect(parseIntent('best size 2')).toBeNull();
  });
});
