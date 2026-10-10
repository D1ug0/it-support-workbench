import Dexie from 'dexie'

// Learning and workshop share a database so a backup can be restored atomically.
export const workshopDb = new Dexie('it-support-workbench-workshop')
workshopDb.version(1).stores({ settings: 'id', labs: 'id', graphs: 'id', reports: 'id,at' })
workshopDb.version(2).stores({ courses: 'id' })
workshopDb.version(3).stores({ baseProgress: 'id', standAttempts: 'id' })
