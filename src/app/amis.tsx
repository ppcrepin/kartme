import { Redirect } from 'expo-router';

/**
 * L'ancien onglet Amis, devenu une simple redirection.
 *
 * Il a fusionné dans le classement le 2026-08-01 (décision PO : « on le fusionne
 * dans le classement ») : la liste d'amis ÉTAIT déjà le classement en portée
 * « Amis », et deux écrans montraient les mêmes pilotes à deux endroits.
 *
 * Cette route ne peut pas disparaître pour autant : des notifications DÉJÀ
 * ENVOYÉES portent `url = 'amis'`, elles vivent dans les boîtes de réception et
 * dans les push en attente. Les supprimer aurait transformé chaque « Untel veut
 * t'ajouter » reçu avant aujourd'hui en page blanche — un lien mort qu'on ne
 * peut plus rattraper une fois parti.
 *
 * Elle vit HORS du groupe (tabs), et c'est délibéré. Rangée dans la pile du
 * classement, un lien profond `/amis` y était ancré par `initialRouteName` :
 * la redirection remplaçait alors le sommet d'une pile qui portait DÉJÀ le
 * classement, et l'on se retrouvait avec deux instances empilées — un retour
 * arrière tombait sur un second classement vierge au lieu de sortir.
 */
export default function AmisRedirige() {
  return <Redirect href="/classements" />;
}
