# SPÉCIFICATIONS TECHNIQUES & RIGUEUR DU CODE

## 1. Approche Data-Driven
- Séparer drastiquement les données de la logique du moteur.
- Les pools de cartes, d'identités et les caractéristiques des ennemis doivent être stockés dans des structures de données pures (dictionnaires, JSON, ou classes de configuration).
- L'ajout de contenu (ex: une nouvelle carte) ne doit JAMAIS nécessiter la modification des boucles logiques de combat.

## 2. Gestion des Cas Limites (Edge Cases)
- Anticiper systématiquement les ruptures de flux : main vide, pioche vide, mort d'une cible au milieu d'une résolution de combo, mana négatif.
- Implémenter des garde-fous (clamping, checks de validité) avant d'appliquer les effets.

## 3. Modularité & Propreté
- Pas de fonctions géantes. Une fonction = une seule responsabilité (Single Responsibility Principle).
- Le code doit être documenté avec des commentaires concis expliquant le "pourquoi" de la logique.