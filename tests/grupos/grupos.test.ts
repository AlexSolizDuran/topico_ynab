import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { crearBaseDePruebas, type BaseDePruebas } from '../helpers/pg'
import { crearCartera, crearGrupo as grupoDePrueba, crearUsuario } from '../helpers/fabricas'
import { GrupoNoExiste,
  NombreDeGrupoEnUso,
  OrdenDeGrupoInvalido,
  archivarGrupo,
  buscarGrupo,
  cambiarNombreGrupo,
  cambiarOrdenGrupo,
  crearGrupo,
  listarGrupos,
  listarGruposArchivados,
  restaurarGrupo,
} from '@/repos/grupos'
import { CarteraArchivada } from '@/repos/carteras'

/**
 * `grupos` es presentacional: no tiene saldo, ni presupuesto, ni total guardado.
 *
 * La consecuencia practica es que este repositorio no tiene aritmetica, y estas
 * pruebas no tienen ningun importe. Lo que si se verifica es lo que el requerimiento
 * exige alrededor: que archivar no toque nada, que reordenar no altere nada, y que
 * un grupo de otra cartera no exista.
 */

let base: BaseDePruebas
let usuario: number
let cartera: number

beforeEach(async () => {
  base = await crearBaseDePruebas()
  usuario = await crearUsuario(base.db)
  cartera = await crearCartera(base.db, usuario, { nombre: 'Casa' })
})

afterEach(async () => {
  await base.cerrar()
})

describe('grupos', () => {
  it('crea un grupo y lo deja en la lista activa de su cartera', async () => {
    const creado = await crearGrupo(base.db, usuario, cartera, 'Casa')
    expect(creado.nombre).toBe('Casa')
    expect(creado.archivado).toBe(false)

    const lista = await listarGrupos(base.db, usuario, cartera)
    expect(lista.map((g) => g.nombre)).toEqual(['Casa'])
  })

  it('rechaza un nombre repetido en la misma cartera', async () => {
    await crearGrupo(base.db, usuario, cartera, 'Casa')
    await expect(crearGrupo(base.db, usuario, cartera, 'Casa')).rejects.toBeInstanceOf(
      NombreDeGrupoEnUso,
    )
  })

  it('admite el mismo nombre en otra cartera, porque cada cartera es independiente', async () => {
    const otro = await crearUsuario(base.db)
    const carteraAjena = await crearCartera(base.db, otro, { nombre: 'Otro' })

    await crearGrupo(base.db, usuario, cartera, 'Casa')
    await expect(crearGrupo(base.db, usuario, carteraAjena, 'Casa')).rejects.toThrow()
  })

  it('presenta los grupos en el orden que el usuario fijo', async () => {
    await grupoDePrueba(base.db, cartera, { nombre: 'Tercero', orden: 2 })
    await grupoDePrueba(base.db, cartera, { nombre: 'Primero', orden: 0 })
    await grupoDePrueba(base.db, cartera, { nombre: 'Segundo', orden: 1 })

    const lista = await listarGrupos(base.db, usuario, cartera)
    expect(lista.map((g) => g.nombre)).toEqual(['Primero', 'Segundo', 'Tercero'])
  })

  it('reordenar mueve el grupo y no toca su nombre', async () => {
    const casa = await grupoDePrueba(base.db, cartera, { nombre: 'Casa', orden: 5 })
    const moviles = await grupoDePrueba(base.db, cartera, { nombre: 'Moviles', orden: 1 })

    expect((await listarGrupos(base.db, usuario, cartera)).map((g) => g.nombre)).toEqual([
      'Moviles',
      'Casa',
    ])

    await cambiarOrdenGrupo(base.db, usuario, cartera, casa, 0)

    const lista = await listarGrupos(base.db, usuario, cartera)
    expect(lista.map((g) => g.nombre)).toEqual(['Casa', 'Moviles'])
    // El grupo que no se movio conserva su nombre y su orden.
    expect(lista.find((g) => g.id === moviles)).toMatchObject({ nombre: 'Moviles', orden: 1 })
    expect(lista.find((g) => g.id === casa)).toMatchObject({ nombre: 'Casa', orden: 0 })
  })

  it('rechaza un orden negativo o no entero, en vez de guardarlo', async () => {
    const casa = await grupoDePrueba(base.db, cartera, { nombre: 'Casa' })
    for (const orden of [-1, -100, 1.5, Number.NaN]) {
      await expect(cambiarOrdenGrupo(base.db, usuario, cartera, casa, orden)).rejects.toBeInstanceOf(
        OrdenDeGrupoInvalido,
      )
    }
    // Y el grupo se queda donde estaba.
    expect((await listarGrupos(base.db, usuario, cartera))[0]?.orden).toBe(0)
  })

  it('renombra un grupo sin cambiar nada mas', async () => {
    const casa = await grupoDePrueba(base.db, cartera, { nombre: 'Casa' })
    await cambiarNombreGrupo(base.db, usuario, cartera, casa, 'Hogar')
    expect((await buscarGrupo(base.db, usuario, cartera, casa)).nombre).toBe('Hogar')
  })

  it('rechaza renombrar a un nombre que ya existe en la cartera', async () => {
    await grupoDePrueba(base.db, cartera, { nombre: 'Casa' })
    const moviles = await grupoDePrueba(base.db, cartera, { nombre: 'Moviles' })
    await expect(cambiarNombreGrupo(base.db, usuario, cartera, moviles, 'Casa')).rejects.toBeInstanceOf(
      NombreDeGrupoEnUso,
    )
  })

  it('archiva un grupo y lo saca de la lista activa sin borrarlo', async () => {
    const casa = await grupoDePrueba(base.db, cartera, { nombre: 'Casa' })
    await archivarGrupo(base.db, usuario, cartera, casa)

    expect(await listarGrupos(base.db, usuario, cartera)).toHaveLength(0)
    const archivados = await listarGruposArchivados(base.db, usuario, cartera)
    expect(archivados.map((g) => g.nombre)).toEqual(['Casa'])
    // Archivar no es borrar: el grupo sigue-readable por id.
    expect((await buscarGrupo(base.db, usuario, cartera, casa)).archivado).toBe(true)
  })

  it('no archiva dos veces un grupo ya archivado', async () => {
    const casa = await grupoDePrueba(base.db, cartera, { nombre: 'Casa' })
    await archivarGrupo(base.db, usuario, cartera, casa)
    await expect(archivarGrupo(base.db, usuario, cartera, casa)).rejects.toBeInstanceOf(GrupoNoExiste)
  })

  it('restaurar devuelve el grupo al agrupamiento', async () => {
    const casa = await grupoDePrueba(base.db, cartera, { nombre: 'Casa' })
    await archivarGrupo(base.db, usuario, cartera, casa)
    await restaurarGrupo(base.db, usuario, cartera, casa)

    expect((await listarGrupos(base.db, usuario, cartera)).map((g) => g.nombre)).toEqual(['Casa'])
    expect(await listarGruposArchivados(base.db, usuario, cartera)).toHaveLength(0)
  })

  it('no restaura un grupo que no esta archivado', async () => {
    const casa = await grupoDePrueba(base.db, cartera, { nombre: 'Casa' })
    await expect(restaurarGrupo(base.db, usuario, cartera, casa)).rejects.toBeInstanceOf(GrupoNoExiste)
  })

  it('un grupo de otra cartera no existe, ni aunque se conozca el id', async () => {
    const otro = await crearUsuario(base.db)
    const carteraAjena = await crearCartera(base.db, otro, { nombre: 'Otro' })
    const grupoAjeno = await grupoDePrueba(base.db, carteraAjena, { nombre: 'Suyo' })

    await expect(buscarGrupo(base.db, usuario, cartera, grupoAjeno)).rejects.toBeInstanceOf(GrupoNoExiste)
    await expect(cambiarNombreGrupo(base.db, usuario, cartera, grupoAjeno, 'Mio')).rejects.toBeInstanceOf(
      GrupoNoExiste,
    )
    await expect(archivarGrupo(base.db, usuario, cartera, grupoAjeno)).rejects.toBeInstanceOf(
      GrupoNoExiste,
    )
    await expect(cambiarOrdenGrupo(base.db, usuario, cartera, grupoAjeno, 0)).rejects.toBeInstanceOf(
      GrupoNoExiste,
    )
  })

  it('la lista de un usuario no incluye grupos de otro', async () => {
    const otro = await crearUsuario(base.db)
    const carteraAjena = await crearCartera(base.db, otro, { nombre: 'Otro' })
    await grupoDePrueba(base.db, carteraAjena, { nombre: 'Suyo' })
    await grupoDePrueba(base.db, cartera, { nombre: 'Mio' })

    const lista = await listarGrupos(base.db, usuario, cartera)
    expect(lista.map((g) => g.nombre)).toEqual(['Mio'])
    // Y la cartera ajena, desde el otro usuario, tampoco.
    expect((await listarGrupos(base.db, otro, carteraAjena)).map((g) => g.nombre)).toEqual(['Suyo'])
  })

  it('no crea grupos en una cartera archivada', async () => {
    // `archivarCartera` todavia no sirve para esto: su guard de saldos exige `sobres`
    // y `asignaciones`, que llegan en `050-sobres`. Se marca la bandera por SQL, que
    // es exactamente el estado que el repositorio tiene que respetar.
    await base.pg.query('update carteras set archivada = true where id = $1', [cartera])
    await expect(crearGrupo(base.db, usuario, cartera, 'Casa')).rejects.toBeInstanceOf(CarteraArchivada)
  })

  it('no crea grupos en una cartera que no es del usuario', async () => {
    const otro = await crearUsuario(base.db)
    const carteraAjena = await crearCartera(base.db, otro, { nombre: 'Otro' })
    await expect(crearGrupo(base.db, usuario, carteraAjena, 'Casa')).rejects.toThrow()
  })
})
